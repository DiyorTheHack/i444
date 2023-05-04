import React from 'react';

import { GradesWs } from '../lib/grades-ws.js';

import { CourseInfo as C, GradeTable as G, GradesImpl, COURSES }
  from 'cs544-prj1-sol';

import { Result, errResult } from 'cs544-js-utils';

type GradesTableProps = {
  ws: GradesWs,
  courseId: string,
  courseInfo: C.CourseInfo,
  grades: G.Grades,
  setResult: (result: Result<G.Grades>) => void,
};

type Patches = {
  [rowId: string]: { [colId: string]: G.RawData }
};


export default function GradesTable(props: GradesTableProps) {
  const { ws, courseId, courseInfo, grades, setResult } = props;

  // Pull out the full-table data rows array from the grades prop
  const dataRows = grades.getFullTable();

  // If there are no rows in the array, simply return an empty <table> with an empty <tbody>
  if (dataRows.length === 0) {
    return (
      <table>
        <tbody>
          <Header hdrs={[]} />
        </tbody>
      </table>
    );
  }
  
  const changeGradeHandler = (rowId: string, colId: string, val: string) => {
    if (val !== "" && isNaN(Number(val))) {
      setResult(errResult(`Invalid grade value: ${val}`));
      return;
    }
  
    const patches: Patches = { [rowId]: { [colId]: val } };
  
    ws.updateCourseGrades(courseId, patches)
      .then((result: Result<G.Grades>) => setResult(result));
  };
  

  return (
    <table>
      <tbody>
        <Header hdrs={Object.keys(dataRows[0])} />
        <DataTable
          data={dataRows}
          courseInfo={courseInfo}
          changeGrade={changeGradeHandler}
        />
      </tbody>
    </table>
  );
  
}

/* The following sub-components are based on the visual layout of
   a GradesTable:

     + A GradesTable will contain a Header and a DataTable.

     + A Header simply consists of a <tr> row containing <th> entries
       for each header.

     + A DataTable consists of a sequence of DataRow's.

     + A DataRow is a <tr> containing a sequence of <td> entries.
       Each <td> entry contains a GradeInput component or plain data
       depending on whether or not the entry should be editable.

     + A GradeInput will be a <input> widget which displays the current
       data and has change and blur handlers.  The change handler is
       used to reflect the DOM state of the <input> in the react state
       and the blur handler is used to trigger changes in the overall
       Grades component via the changeGrade prop.  
  
  Note that all the following sub-components are set up to return
  an empty fragment as a placeholder to keep TS happy.

*/

type HeaderProps = {
  hdrs: string[],
};

function Header(props: HeaderProps) {
  const { hdrs } = props;

  return (
    <tr>
      {hdrs.map((header) => (
        <th key={header}>{header}</th>
      ))}
    </tr>
  );
}


type DataTableProps = {
  data: G.GradeRow[],
  courseInfo: C.CourseInfo,
  changeGrade: (rowId: string, colId: string, val: string) => void,
};

function DataTable(props: DataTableProps) {
  const { data, courseInfo, changeGrade } = props;
  
  return (
    <>
      {data.map((dataRow, index) => (
        <DataRow
          key={index}
          dataRow={dataRow}
          courseInfo={courseInfo}
          changeGrade={changeGrade}
        />
      ))}
    </>
  );
}


type DataRowProps = {
  dataRow: G.GradeRow,
  courseInfo: C.CourseInfo,
  changeGrade: (rowId: string, colId: string, val: string) => void,
};

function DataRow(props: DataRowProps) {
  const { dataRow, courseInfo, changeGrade } = props;

  const rowId = dataRow[courseInfo.rowIdColId]?.toString() || '';

  const formatVal = (value: G.Grade) => {
    if (typeof value === 'number') {
      return value.toFixed(1);
    }
    return value.toString();
  };

  const isEditable = (rowId: string, colId: string) => {
    return (
      rowId &&
      courseInfo.cols[colId]?.kind === 'score' &&
      colId !== courseInfo.rowIdColId
    );
  };

  //const rowId = dataRow[courseInfo.rowIdColId];

  return (
    <tr>
      {Object.entries(dataRow).map(([colId, value]) => {
        if (isEditable(rowId, colId)) {
          return (
            <td key={colId}>
              <GradeInput
                rowId={rowId}
                colId={colId}
                val={formatVal(value)}
                changeGrade={changeGrade}
              />
            </td>
          );
        } else {
          return <td key={colId}>{formatVal(value)}</td>;
        }
      })}
    </tr>
  );
}



type GradeInputProps = {
  rowId: string,
  colId: string,
  val: string,
  changeGrade: (rowId: string, colId: string, val: string) => void,
};

function GradeInput(props: GradeInputProps) {
  const { rowId, colId, val, changeGrade } = props;

  const [value, setValue] = React.useState(val);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (value !== val) {
      changeGrade(rowId, colId, value);
    }
  };

  return (
    <input size={3} value={value} onChange={handleChange} onBlur={handleBlur} />
  );
}

