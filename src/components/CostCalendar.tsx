import Button from "@mui/material/Button";
import { dateLabel, money } from "../format";

export function CostCalendar({
  today,
  selectedDate,
  costs,
  onSelect,
}: {
  today: string;
  selectedDate: string;
  costs: Map<string, number>;
  onSelect: (date: string) => void;
}) {
  const [year, month] = selectedDate.split("-").map(Number);
  const prefix = selectedDate.slice(0, 7);
  const offset = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  function changeMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    onSelect(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }
  return (
    <section aria-labelledby="calendar-title">
      <div className="section-heading calendar-heading">
        <h2 id="calendar-title" aria-live="polite">
          {year}年{month}月
        </h2>
        <div className="calendar-controls">
          <Button onClick={() => changeMonth(-1)} aria-label="前の月">
            ‹
          </Button>
          <Button onClick={() => onSelect(today)}>今日</Button>
          <Button onClick={() => changeMonth(1)} aria-label="次の月">
            ›
          </Button>
        </div>
      </div>
      <div className="cost-calendar">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <span className="calendar-weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from({ length: cells }, (_, index) => {
          const day = index - offset + 1;
          if (day < 1 || day > days)
            return <span aria-hidden="true" key={index} />;
          const date = `${prefix}-${String(day).padStart(2, "0")}`;
          const cost = costs.get(date);
          return (
            <Button
              key={index}
              className="calendar-day"
              aria-label={`${year}年${dateLabel(date)}、${cost === undefined ? "記録なし" : money(cost)}`}
              aria-pressed={date === selectedDate}
              aria-current={date === today ? "date" : undefined}
              onClick={() => onSelect(date)}
            >
              <span className="calendar-date">{day}</span>
              <span className="calendar-cost">
                {cost === undefined ? "—" : money(cost)}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
