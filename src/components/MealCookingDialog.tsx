import { useState, type FormEvent } from "react";
import Button from "@mui/material/Button";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { commandSchema } from "../domain/commands";
import { type State } from "../domain/inventory";
import { cookingInput, type CookingDraft } from "../meal-draft";
import { useInventorySummary } from "../inventory-summary";
import { FullScreenDialog } from "./FullScreenDialog";
import { UsedItems } from "./UsedItems";

export function MealCookingDialog({
  state,
  date,
  draft,
  onClose,
  onConfirm,
}: {
  state: State;
  date: string;
  draft: CookingDraft;
  onClose: () => void;
  onConfirm: (draft: CookingDraft) => void;
}) {
  const [value, setValue] = useState(draft);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const summary = useInventorySummary(state);
  const available = state.products.filter(
    (p) =>
      summary.products.get(p.id)!.quantity > 0 ||
      value.rows.some((r) => r.productId === p.id),
  );
  const invalidEaten =
    !(Number(value.eatenServings) > 0) ||
    Number(value.eatenServings) > Number(value.servings);
  function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const parsed = commandSchema.safeParse({
      type: "meal.create-with-cookings",
      input: { date, kind: "夕食", inputs: [], prepared: [] },
      cookings: [cookingInput(value)],
    });
    if (!parsed.success || !value.rows.length || invalidEaten) {
      setError(
        invalidEaten
          ? "今回食べた量は0より大きく、作った量以下で入力してください"
          : "料理名・作った量・食材の入力を確認してください",
      );
      return;
    }
    onConfirm({ ...value, name: value.name.trim() });
  }
  return (
    <FullScreenDialog
      open
      onClose={onClose}
      aria-labelledby="meal-cooking-title"
      slotProps={{ paper: { className: "full-screen-dialog" } }}
    >
      <DialogTitle className="full-screen-heading">
        <span id="meal-cooking-title">料理にまとめる</span>
        <IconButton
          aria-label="料理の入力を閉じる"
          onClick={onClose}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon>
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6-5.6 5.6L5 17.6l5.6-5.6L5 6.4z" />
          </SvgIcon>
        </IconButton>
      </DialogTitle>
      <DialogContent className="full-screen-content">
        <form
          className="entry-form wide"
          onSubmit={submit}
          onInvalid={() => setAttempted(true)}
          onChangeCapture={() => setError("")}
        >
          <TextField
            label="料理名"
            required
            autoFocus
            value={value.name}
            error={attempted && !value.name.trim()}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
          <div className="two-columns">
            <TextField
              label="作った量"
              required
              type="number"
              value={value.servings}
              error={attempted && !(Number(value.servings) > 0)}
              slotProps={{
                htmlInput: { min: 0.001, max: 1e9, step: 0.001 },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">食分</InputAdornment>
                  ),
                },
              }}
              onChange={(e) => setValue({ ...value, servings: e.target.value })}
            />
            <TextField
              label="今回食べた量"
              required
              type="number"
              value={value.eatenServings}
              error={attempted && invalidEaten}
              slotProps={{
                htmlInput: {
                  min: 0.001,
                  max: Number(value.servings) || 1e9,
                  step: 0.001,
                },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">食分</InputAdornment>
                  ),
                },
              }}
              onChange={(e) =>
                setValue({ ...value, eatenServings: e.target.value })
              }
            />
          </div>
          <h2>使った食材</h2>
          <UsedItems
            state={state}
            rows={value.rows}
            available={available}
            onChange={(rows) => setValue({ ...value, rows })}
            itemLabel="食材"
            showErrors={attempted}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <Button onClick={onClose}>キャンセル</Button>
            <Button type="submit" variant="contained">
              まとめる
            </Button>
          </div>
        </form>
      </DialogContent>
    </FullScreenDialog>
  );
}
