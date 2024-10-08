export async function getNFLState() {
  const nflState = await fetch(`https://api.sleeper.app/v1/state/nfl`)
  return await nflState.json()
}
