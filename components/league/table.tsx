import React, { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css' // Mandatory CSS required by the Data Grid
import 'ag-grid-community/styles/ag-theme-material.css'

interface IGridExampleProps {
  tableRowData: any
}

const GridExample = ({ tableRowData }: IGridExampleProps) => {
  const [colDefs, setColDefs] = useState([
    { headerName: 'Name', field: 'managerName' },
    { headerName: `K Points`, field: 'kickerPoints' },
    { headerName: `DEF Points`, field: 'defPoints' },
  ])

  const defaultColDef = {
    flex: 1,
  }

  return (
    <div className={'ag-theme-material-dark'} style={{ width: '95vw', height: '90vh' }}>
      <AgGridReact rowData={tableRowData} columnDefs={colDefs} defaultColDef={defaultColDef} />
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
