*BEfore doing this, create a MAIN branch as the main branch for the repo, then your changes into another*

Build a responsive, modern web application (React frontend with a Node.js/Express backend) that dynamically generates and calculates Google Classroom-compatible rubrics.

### Core Features & Architecture:
**Rubric Canvas (Main UI)**:
   - **Total Points Input**: A prominent header control allowing the user to enter the assignment's total point value.
   - **Level Percentage Row**: Display percentage levels across columns (e.g., Row 6 logic: 100%, 90%, 80%, 70%, 60%, 1%).
   - **Dynamic Criterion Creation**:
     - Render the first Criterion row/card by default.
     - Automatically create a new Criterion block when the user types into the title field of the current Criterion.
     - Include an explicit "Delete Criterion" button on each block to let users remove unneeded criteria.
**Values Calculation Engine**:
   - Create a dedicated "Values Breakdown" tab or view in the app (mirroring the required 'Values' sheet logic):
     - Calculate point values from the total points, row weights, and level percentages set in the main UI.
     - Map criteria sequentially (e.g., Row 5 for Criterion 1, Row 10 for Criterion 2, Row 15 for Criterion 3).
     - **Rounding Logic**: Automatically calculate and display whole number point values for each performance level while preserving exact underlying percentage weights in row 6.
**Import & Export Requirements**:
   - **Google Classroom CSV Export**: Add an "Export to Google Classroom CSV" button that generates a properly formatted CSV matching Google Classroom's rubric import format (Criterion Name, Description, Level Title, Description, Points).
   - **Google Sheets / XLSX Export**: Provide an option to download the full interactive rubric structure as a multi-sheet Excel file (`Rubric Template` and `Values`).
**Tech Stack & UI**:
   - **Frontend**: React (Tailwind CSS or Shadcn UI for clean design).
   - **Backend**: Express.js with `xlsx` or `exceljs` library to generate spreadsheet downloads.
   - **State Management**: React state or Zustand to handle dynamic row additions, auto-calculations, and rounding updates instantly without full page reloads.
Please generate the complete source code structure, including components, calculation utilities, and export handlers.

See the attached image for the rows and column formatting of the sheet; keep the same Mastery to Failing criterion names & values