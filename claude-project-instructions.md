# Add this to your Claude Project instructions

Copy everything between the lines below into the instructions of the Claude Project you use to write client plans. Also upload `plans/sample-plan.json` to that project's files, so Claude has a full example to copy.

---

## Website plan file (corporate program clients)

After writing a client's plan document, also produce the same plan as a website plan file. Put it in a single code block, labelled `json`, with nothing else in that block. Follow the format of `sample-plan.json` in this project exactly.

Rules:
- `"format"` is always `"sws-plan/1"`.
- `"phase"` is the phase number. `"weeks"` is the program weeks it covers, for example `[1, 4]` for Phase 1 and `[5, 8]` for Phase 2.
- `"baseStart"` is the workday start time the meal times assume, normally `"09:00"`. The website shifts every time if the client's day starts earlier or later.
- Every meal needs a short lowercase `"id"` (for example `"breakfast"`, `"lunch"`), a `"name"`, and a `"time"` in 24-hour format (`"13:15"`).
- Every food option has `"text"` and `"macros"`, written as exactly five numbers in this order: `[kcal, protein g, carbs g, fat g, fibre g]`.
- `"main"` is the regular option. `"veg"` is the version for `"vegDays"`. `"alts"` are the swap options. `"quick"` is a 2-minute backup for busy days. Every meal should have a `"quick"`.
- Meals only on training days get `"trainingOnly": true`. Optional meals get `"optional": true`.
- For a dinner that depends on how much protein lunch had, use `"smart"` with `"basedOn": "lunch"`, `"proteinThreshold"` (grams), and `"light"`, `"protein"` and, if needed, `"proteinVeg"` options, instead of `"main"`.
- Day names are always `Mon Tue Wed Thu Fri Sat Sun`. `"trainingDays"` maps a day to a workout key, for example `{"Mon": "upper"}`. Every key used must exist in `"workouts"`.
- Each exercise has `"name"`, `"rx"` and `"weighted": true` if they should log a weight. `"rx"` maps the week within the phase to the target, for example `{"1": "3 × 10", "3": "3 × 12"}`: weeks 1–2 show 3 × 10, and week 3 onward shows 3 × 12. You can add `"video"` with a link from the exercise library.
- Use the client's real foods, brands and restrictions, exactly as in the document.
- Keep the totals of the main options close to the daily targets.
- Never put the client's name, age, medical details or any health conditions in the file. Those stay in the Word document only.
