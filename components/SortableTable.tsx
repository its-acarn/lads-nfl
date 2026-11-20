// A sortable plain HTML table, shared by /waivers and /form.
import { Fragment, ReactNode, useState } from 'react'
import { Box, Button, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react'

// A plain HTML table rather than AG Grid: rows hold wrapping flag chips, and
// a table sizes each row to its content without a measuring pass.

export interface Column<R> {
  key: string
  header: string
  render: (row: R) => ReactNode
  sortValue?: (row: R) => number
  minW?: string
}

interface TableProps<R> {
  rows: R[]
  columns: Column<R>[]
  rowKey: (row: R) => string
  // Sort applied before any header is clicked.
  initialSort?: { key: string; desc: boolean }
  // Rows drawn with a highlighted background (e.g. your own team).
  isHighlighted?: (row: R) => boolean
  // Optional detail shown under a row when it is expanded.
  renderDetail?: (row: R) => ReactNode
  expanded?: string | null
  // Render only this many rows (after sorting), with a button for more.
  pageSize?: number
}

export function SortableTable<R>({
  rows,
  columns,
  rowKey,
  initialSort,
  isHighlighted,
  renderDetail,
  expanded,
  pageSize,
}: TableProps<R>) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(initialSort || null)
  const [limit, setLimit] = useState<number>(pageSize || Infinity)
  const column = sort ? columns.filter((c) => c.key === sort.key)[0] : undefined
  const sorted =
    column && column.sortValue
      ? rows.slice().sort((a, b) => {
          const d = (column.sortValue as (r: R) => number)(a) - (column.sortValue as (r: R) => number)(b)
          return sort && sort.desc ? -d : d
        })
      : rows
  const visible = sorted.slice(0, limit)

  return (
    <Box w={'full'}>
      <TableContainer w={'full'} overflowX={'auto'}>
        <Table size={'sm'} variant={'simple'}>
          <Thead>
            <Tr>
              {columns.map((c) => (
                <Th
                  key={c.key}
                  color={'tertiary'}
                  borderColor={'gray.700'}
                  cursor={c.sortValue ? 'pointer' : 'default'}
                  userSelect={'none'}
                  onClick={() =>
                    c.sortValue && setSort({ key: c.key, desc: sort && sort.key === c.key ? !sort.desc : true })
                  }>
                  {c.header}
                  {sort && sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {visible.map((row) => (
              <Fragment key={rowKey(row)}>
                <Tr bg={isHighlighted && isHighlighted(row) ? 'whiteAlpha.100' : undefined}>
                  {columns.map((c) => (
                    <Td
                      key={c.key}
                      color={'quinary'}
                      borderColor={'gray.800'}
                      minW={c.minW}
                      whiteSpace={'normal'}
                      verticalAlign={'top'}>
                      {c.render(row)}
                    </Td>
                  ))}
                </Tr>
                {renderDetail && expanded === rowKey(row) && (
                  <Tr>
                    <Td colSpan={columns.length} borderColor={'gray.800'} whiteSpace={'normal'}>
                      {renderDetail(row)}
                    </Td>
                  </Tr>
                )}
              </Fragment>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      {sorted.length > visible.length && (
        <Button
          mt={3}
          size={'sm'}
          variant={'outline'}
          colorScheme={'green'}
          onClick={() => setLimit(limit + (pageSize || sorted.length))}>
          Show more ({sorted.length - visible.length} left)
        </Button>
      )}
    </Box>
  )
}
