import { Select } from '@chakra-ui/react'
import React from 'react'
import { useSelector } from 'react-redux'
import { selectRosters } from '../../redux/leagueDetailsSlice'

interface IFilterSelectProps {
  setSelectedFilter: React.Dispatch<React.SetStateAction<string>>
}

const FilterSelect = (props: IFilterSelectProps) => {
  const rosters = useSelector(selectRosters)

  function onFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    props.setSelectedFilter(e.target.value)
  }

  return (
    <Select
      w={32}
      rounded="full"
      size={'xs'}
      _focus={{ bg: 'quinary', color: 'primary' }}
      variant={'filled'}
      onChange={onFilterChange}>
      <option defaultValue={'All'} disabled value="">
        Filters
      </option>
      <option value="All">All</option>

      {rosters.map((roster: any) => (
        <option key={roster.owner_id} value={roster.display_name}>
          @{roster.display_name}
        </option>
      ))}
    </Select>
  )
}

export default FilterSelect
