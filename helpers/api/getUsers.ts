import axios from 'axios'

export const getUsers = async (leagueId: string) =>
  await axios.get(`https://api.sleeper.app/v1/league/${leagueId}/users`).then((res: any) => res.data)

export const getRosters = async (leagueId: string) =>
  await axios.get(`https://api.sleeper.app/v1/league/${leagueId}/rosters`).then((res: any) => res.data)
