import React, { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css' // Mandatory CSS required by the Data Grid
import 'ag-grid-community/styles/ag-theme-material.css'

interface IGridExampleProps {
  tableData: {
    rows: any
    cols: any
    context: any
  }
}

const GridExample = ({ tableData }: IGridExampleProps) => {
  const defaultColDef = {
    flex: 1,
    sortable: false,
    wrapHeaderText: true,
    resizable: false,
  }

  return (
    <div className={'ag-theme-material-dark'} style={{ width: '95vw' }}>
      <AgGridReact
        context={tableData.context}
        rowData={tableData.rows}
        columnDefs={tableData.cols}
        defaultColDef={defaultColDef}
        domLayout={'autoHeight'}
      />
    </div>
  )
}

export default GridExample

// DEF and Kicker points
// percentage of points this year
// percentage of points all time
// total points this year
// total points all time
// combined points this year
// combined points all time
// does streaming work?
// who's the master streamer?
