import React from 'react'
import useSWR from 'swr'
import { fetcher } from '../helpers/fetcher'
import { dynastyLeagueId } from '../config/config'

type IMenuProps = {}

function Menu(props: IMenuProps) {
  const { data } = useSWR(`https://api.sleeper.app/v1/league/${dynastyLeagueId}/rosters`, fetcher)

  console.log('DATA: ', data)

  return (
    <div>menu</div>
  )
}

export default Menu