import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";

export function PreparedNameForm({
  name: initialName,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSave(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <section aria-labelledby="prepared-title">
      <h2 id="prepared-title">{initialName}を編集</h2>
      <form onSubmit={submit}>
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
          <Button type="submit" variant="contained">
            保存する
          </Button>
          <Button type="button" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </form>
    </section>
  );
}
