"""Composed completion. Inputs are terminal bytes and the independent hook record."""
from __future__ import annotations

import hashlib
import json
import math
import posixpath
import re
from dataclasses import dataclass

_SHA = re.compile(r"[a-f0-9]{64}\Z")
_ECMA_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
PHASES = ("pending", "running", "passed", "failed", "interrupted")
TERMINAL = {"passed", "failed", "cancelled", "interrupted"}


def canonical_json(value):
    """JSON protocol ordering is UTF-16; numbers follow ECMAScript cutoffs."""
    if value is None or isinstance(value, (str, bool)):
        encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        return ''.join('\\u%04x' % ord(char) if 0xD800 <= ord(char) <= 0xDFFF else char for char in encoded)
    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError('non-finite JSON number')
        if number == 0:
            return '0'
        text = repr(number).lower()
        mantissa, _, exponent = text.partition('e')
        exponent = int(exponent or 0)
        sign = '-' if mantissa.startswith('-') else ''
        mantissa = mantissa.lstrip('-')
        before, _, after = mantissa.partition('.')
        digits = (before + after).rstrip('0')
        point = len(before) + exponent
        # repr() may include a leading zero for fractions.
        while digits.startswith('0'):
            digits = digits[1:]
            point -= 1
        if 1e-6 <= abs(number) < 1e21:
            if point <= 0:
                return sign + '0.' + '0' * (-point) + digits
            if point >= len(digits):
                return sign + digits + '0' * (point - len(digits))
            return sign + digits[:point] + '.' + digits[point:]
        power = point - 1
        return sign + digits[0] + ('.' + digits[1:] if len(digits) > 1 else '') + 'e' + ('+' if power >= 0 else '-') + str(abs(power))
    if isinstance(value, list):
        return '[' + ','.join(canonical_json(item) for item in value) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(canonical_json(key) + ':' + canonical_json(value[key]) for key in sorted(value, key=lambda key: key.encode('utf-16-be', errors='surrogatepass'))) + '}'
    raise ValueError('invalid JSON')


def finalization_digest(spec):
    if not isinstance(spec, dict) or type(spec.get('schemaVersion')) is not int or spec['schemaVersion'] not in (1, 2):
        raise ValueError('invalid finalization')
    argv = spec.get('argv')
    timeout = spec.get('timeoutMs')
    if not isinstance(argv, list) or not argv or not all(isinstance(arg, str) and arg and '\0' not in arg for arg in argv):
        raise ValueError('invalid argv')
    if type(timeout) is not int or not 1 <= timeout <= 2147483647:
        raise ValueError('invalid deadline')
    contract = canonical_json(spec.get('contract')).encode('utf-8', errors='surrogatepass')
    if len(contract) > 65536 or hashlib.sha256(contract).hexdigest() != spec.get('contractDigest'):
        raise ValueError('invalid contract')
    normalized = {key: spec[key] for key in ('schemaVersion', 'argv', 'timeoutMs', 'contract', 'contractDigest')}
    return hashlib.sha256(canonical_json(normalized).encode('utf-8', errors='surrogatepass')).hexdigest()


def validate_recipe_finalization(recipe):
    """A malformed explicit requirement can never erase a static hook."""
    expected = finalization_digest(recipe['finalization']) if 'finalization' in recipe else None
    if 'finalizationDigest' in recipe:
        explicit = recipe['finalizationDigest']
        if not isinstance(explicit, str) or not _SHA.fullmatch(explicit):
            raise ValueError('invalid finalization digest')
        if expected is not None and explicit != expected:
            raise ValueError('finalization digest mismatch')
        return explicit
    return expected


def recipe_finalization_digest(recipe):
    try:
        return validate_recipe_finalization(recipe)
    except (ValueError, TypeError, OverflowError, KeyError):
        return 'invalid-finalization-contract'


def normalize_finalization_result(value, required_version=None):
    """Validate protocol data without looking up any publication path."""
    if not isinstance(value, dict):
        raise ValueError('invalid finalization result')
    if len(canonical_json(value).encode('utf-8')) > 65536:
        raise ValueError('finalization result exceeds 64 KiB')
    if (set(value) - ({'schemaVersion', 'cleanup', 'outputs', 'error'} | ({'recovery'} if value.get('schemaVersion') == 2 else set()))
            or type(value.get('schemaVersion')) not in (int, float) or value['schemaVersion'] not in (1, 2)
            or required_version == 2 and value['schemaVersion'] != 2
            or value['schemaVersion'] == 2 and (value.get('recovery') not in ('none', 'retryable', 'blocked-ownership') or value.get('cleanup') != 'uncertain' and value.get('recovery') != 'none')
            or value.get('cleanup') not in ('confirmed', 'not-required', 'uncertain')
            or not isinstance(value.get('outputs'), list)
            or ('error' in value and not isinstance(value['error'], str))):
        raise ValueError('invalid finalization result')
    outputs = []
    for item in value['outputs']:
        if not isinstance(item, dict) or set(item) != {'path', 'sha256', 'role'}:
            raise ValueError('invalid output')
        path, sha256, role = item['path'], item['sha256'], item['role']
        if (not isinstance(path, str) or not path or posixpath.isabs(path)
                or any(char in path for char in ('\\', '\0', '\r', '\n'))
                or '..' in path.split('/') or posixpath.normpath(path) == '.'
                or not isinstance(sha256, str) or not _SHA.fullmatch(sha256)
                or not isinstance(role, str) or not role.strip(_ECMA_WHITESPACE)):
            raise ValueError('invalid output path/hash/role')
        outputs.append({'path': path, 'sha256': sha256, 'role': role})
    return {'schemaVersion': value['schemaVersion'], 'cleanup': value['cleanup'], 'outputs': outputs,
            **({'recovery': value['recovery']} if value['schemaVersion'] == 2 else {}),
            **({'error': value['error']} if 'error' in value else {})}


def execution_completion(ticket, record=None, terminal_digest=None):
    base = {'eligible': False, 'testStatus': ticket.get('status')}
    def result(state, reason=None, bound=False, eligible=False):
        return {**base, 'state': state, 'eligible': eligible,
                **({'reason': reason} if reason else {}),
                **({'finalization': record} if bound else {})}
    if ticket.get('status') not in TERMINAL:
        return result('running')
    test_passed = ticket.get('status') == 'passed' and type(ticket.get('exitCode')) is int and ticket['exitCode'] == 0
    if not ticket.get('finalization') and not ticket.get('finalizationDigest'):
        return result('complete' if ticket.get('schemaVersion') == 4 else 'legacy', eligible=test_passed)
    try:
        if ticket.get('schemaVersion') != 4 or finalization_digest(ticket.get('finalization')) != ticket.get('finalizationDigest'):
            raise ValueError()
    except (ValueError, TypeError, OverflowError, KeyError):
        return result('failed', 'finalization-contract-invalid')
    if (not isinstance(terminal_digest, str) or not _SHA.fullmatch(terminal_digest)
            or not isinstance(record, dict) or type(record.get('schemaVersion')) is not int or record['schemaVersion'] != 1
            or record.get('ticketId') != ticket.get('id') or record.get('ticketDigest') != terminal_digest
            or record.get('finalizationDigest') != ticket.get('finalizationDigest')
            or type(record.get('attempt')) is not int or record['attempt'] < 0
            or record.get('phase') not in PHASES
            or record.get('recovery', 'none') not in ('none', 'retryable', 'blocked-ownership')):
        return result('running', 'finalization-unverified')
    if record.get('phase') in ('pending', 'running'):
        return result('running', bound=True)
    try:
        output = normalize_finalization_result(record.get('result'), ticket['finalization']['schemaVersion'])
    except (ValueError, TypeError, OverflowError, UnicodeError):
        return result('failed', 'finalization-failed', bound=True)
    cleanup = output['cleanup']
    if (record.get('phase') != 'passed' or type(record.get('exitCode')) is not int or record['exitCode'] != 0
            or record.get('recovery', 'none') != 'none' or record.get('recovery', 'none') != output.get('recovery', 'none')
            or record.get('failureReason') or output.get('error')):
        return result('failed', 'cleanup-uncertain' if cleanup == 'uncertain' else 'finalization-failed', bound=True)
    return result('complete', bound=True, eligible=test_passed)


@dataclass(frozen=True)
class CompletionEvidence:
    record: dict | None
    terminal_digest: str | None


def completion_for_job(job):
    evidence = job.get('_completionEvidence')
    if not isinstance(evidence, CompletionEvidence):
        return execution_completion(job)
    return execution_completion(job, evidence.record, evidence.terminal_digest)


def public_completion(job):
    completion = completion_for_job(job)
    projected = {key: completion[key] for key in ('state', 'eligible', 'testStatus', 'reason') if key in completion}
    record = completion.get('finalization')
    if record and record.get('phase') in PHASES:
        projected['finalization'] = {'phase': record['phase'], 'recovery': record.get('recovery', 'none')}
        output = record.get('result')
        if isinstance(output, dict) and output.get('cleanup') in ('confirmed', 'not-required', 'uncertain'):
            projected['finalization']['cleanup'] = output['cleanup']
        if record.get('failureReason') or (isinstance(output, dict) and output.get('error')):
            # Private hook errors may contain paths, argv, tokens or environment.
            projected['finalization']['error'] = 'finalization-failed'
    return projected
