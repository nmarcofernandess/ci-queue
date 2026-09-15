import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function FilterSelect({
  value,
  onValueChange,
  label,
  options,
  placeholder,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
  className?: string
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className={className ?? "max-w-56 min-w-0"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
