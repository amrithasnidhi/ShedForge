interface TimetableExcelRow {
  day: string;
  start_time: string;
  end_time: string;
  semester: string;
  section: string;
  batch: string;
  course_code: string;
  course_name: string;
  course_type: string;
  faculty_name: string;
  faculty_department: string;
  room_name: string;
  building: string;
  student_count: string;
}

function escapeXml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlCell(value: string | number, styleId: string = "Default"): string {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const type = isNumber ? "Number" : "String";
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function buildSpreadsheetXml(
  rows: TimetableExcelRow[],
  metadata: Array<[string, string]>,
): string {
  const metadataRows = metadata
    .filter(([, value]) => value.trim().length > 0)
    .map(
      ([label, value]) =>
        `<Row>${xmlCell(label, "MetaLabel")}${xmlCell(value, "MetaValue")}</Row>`,
    )
    .join("");

  const headerRow = [
    "Day",
    "Start Time",
    "End Time",
    "Semester",
    "Section",
    "Batch",
    "Course Code",
    "Course Name",
    "Course Type",
    "Faculty",
    "Department",
    "Room",
    "Building",
    "Student Count",
  ]
    .map((header) => xmlCell(header, "Header"))
    .join("");

  const dataRows = rows
    .map((row) => {
      const cells = [
        row.day,
        row.start_time,
        row.end_time,
        row.semester,
        row.section,
        row.batch,
        row.course_code,
        row.course_name,
        row.course_type,
        row.faculty_name,
        row.faculty_department,
        row.room_name,
        row.building,
        row.student_count,
      ].map((item) => xmlCell(item));
      return `<Row>${cells.join("")}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:FontName="Calibri" ss:Size="11"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetaLabel">
   <Font ss:Bold="1" ss:FontName="Calibri" ss:Size="11"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetaValue">
   <Font ss:FontName="Calibri" ss:Size="11"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Timetable">
  <Table>
   <Column ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:AutoFitWidth="0" ss:Width="85"/>
   <Column ss:AutoFitWidth="0" ss:Width="85"/>
   <Column ss:AutoFitWidth="0" ss:Width="80"/>
   <Column ss:AutoFitWidth="0" ss:Width="80"/>
   <Column ss:AutoFitWidth="0" ss:Width="70"/>
   <Column ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:AutoFitWidth="0" ss:Width="220"/>
   <Column ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:AutoFitWidth="0" ss:Width="180"/>
   <Column ss:AutoFitWidth="0" ss:Width="130"/>
   <Column ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:AutoFitWidth="0" ss:Width="120"/>
   <Column ss:AutoFitWidth="0" ss:Width="100"/>
   ${metadataRows}
   <Row/>
   <Row>${headerRow}</Row>
   ${dataRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${metadata.length + 2}</SplitHorizontal>
   <TopRowBottomPane>${metadata.length + 2}</TopRowBottomPane>
   <Panes>
    <Pane>
     <Number>3</Number>
     <ActiveRow>0</ActiveRow>
    </Pane>
   </Panes>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

export function downloadTimetableExcel(
  filename: string,
  rows: TimetableExcelRow[],
  metadata: Array<[string, string]>,
): void {
  const xml = buildSpreadsheetXml(rows, metadata);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type { TimetableExcelRow };
