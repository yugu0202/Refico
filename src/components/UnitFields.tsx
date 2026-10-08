import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";

export function UnitFields({
  name,
  factor,
  base,
  onChange,
  onRemove,
  autoFocus = false,
}: {
  name: string;
  factor: string;
  base: string;
  onChange: (name: string, factor: string) => void;
  onRemove?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className={`unit-row${onRemove ? "" : " unit-row-single"}`}>
      <TextField
        label="単位名"
        required
        autoFocus={autoFocus}
        value={name}
        placeholder="合・袋・パック"
        slotProps={{
          htmlInput: { maxLength: 20 },
          input: {
            startAdornment: <InputAdornment position="start">1</InputAdornment>,
          },
        }}
        onChange={(e) => onChange(e.target.value, factor)}
      />
      <span aria-hidden="true">=</span>
      <TextField
        label="量"
        required
        type="number"
        value={factor}
        slotProps={{
          htmlInput: {
            inputMode: "decimal",
            min: "0.001",
            step: "0.001",
            "aria-label": `1${name || "単位"}あたりの量（${base}）`,
          },
          input: {
            endAdornment: (
              <InputAdornment position="end">{base}</InputAdornment>
            ),
          },
        }}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {onRemove && (
        <IconButton
          type="button"
          aria-label={`${name || "単位"}を削除`}
          onClick={onRemove}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon
            fontSize="small"
            sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
          >
            <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7" />
          </SvgIcon>
        </IconButton>
      )}
    </div>
  );
}
