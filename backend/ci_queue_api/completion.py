"""Composed completion. Inputs are terminal bytes and the independent hook record."""
from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass

_SHA = re.compile(r"[a-f0-9]{64}\Z")
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
    if not isinstance(spec, dict) or type(spec.get('schemaVersion')) is not int or spec['schemaVersion'] != 1:
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


def recipe_finalization_digest(recipe):
    if 'finalizationDigest' in recipe:
        return recipe['finalizationDigest']
    if recipe.get('finalization') is not None:
        try:
            return finalization_digest(recipe['finalization'])
        except (ValueError, TypeError, OverflowError):
            return 'invalid-finalization-contract'
    return None


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
            or type(record.get('attempt')) is not int or record['attempt'] < 0):
        return result('running', 'finalization-unverified')
    if record.get('phase') in ('pending', 'running'):
        return result('running', bound=True)
    output = record.get('result')
    cleanup = output.get('cleanup') if isinstance(output, dict) else None
    if (record.get('phase') != 'passed' or type(record.get('exitCode')) is not int or record['exitCode'] != 0
            or record.get('failureReason') or not isinstance(output, dict) or type(output.get('schemaVersion')) is not int or output['schemaVersion'] != 1
            or not isinstance(output.get('outputs'), list)
            or output.get('error') or cleanup not in ('confirmed', 'not-required')):
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
    if record:
        projected['finalization'] = {'phase': record['phase']}
        output = record.get('result')
        if isinstance(output, dict) and output.get('cleanup') in ('confirmed', 'not-required', 'uncertain'):
            projected['finalization']['cleanup'] = output['cleanup']
        if record.get('failureReason') or (isinstance(output, dict) and output.get('error')):
            # Private hook errors may contain paths, argv, tokens or environment.
            projected['finalization']['error'] = 'finalization-failed'
    return projected
