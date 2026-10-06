import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, useRef, type FormEvent } from "react";

export function PreparedNameForm({
  name: initialName,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section aria-labelledby="prepared-title">
      <h2 id="prepared-title">{initialName}を編集</h2>
      <form onSubmit={submit}>
        <fieldset className="form-fields" disabled={saving}>
          <TextField
            className="field"
            label="料理名"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={saving} variant="contained">
              保存する
            </Button>
            <Button type="button" onClick={onCancel}>
              キャンセル
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
