import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
export interface ItemOption {
  id: string;
  name: string;
  group?: string;
  action?: boolean;
}

export function ItemSelect({
  label,
  options,
  value,
  onChange,
  required = true,
  showErrors = false,
}: {
  label: string;
  options: ItemOption[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  showErrors?: boolean;
}) {
  return (
    <Autocomplete
      className="field item-select"
      options={options}
      filterOptions={(items, filterState) => [
        ...createFilterOptions<ItemOption>()(
          items.filter((o) => !o.action),
          filterState,
        ),
        ...items.filter((o) => o.action),
      ]}
      value={options.find((o) => o.id === value) ?? null}
      getOptionLabel={(o) => o.name}
      getOptionKey={(o) => o.id}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      groupBy={options.some((o) => o.group) ? (o) => o.group ?? "" : undefined}
      onChange={(_, option) => onChange(option?.id ?? "")}
      openText="候補を表示"
      closeText="候補を閉じる"
      clearText="選択を解除"
      noOptionsText="一致する項目がありません"
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={showErrors && !value}
          helperText={showErrors && !value ? "選択してください" : undefined}
        />
      )}
    />
  );
}
