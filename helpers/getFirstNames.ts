import { findNFLPlayerWithId } from './findNFLPlayerWithId'

export const getFirstNames = (playerIds: Array<string>) => {
  const players = playerIds.map((playerId: string) => findNFLPlayerWithId(Number(playerId)))
  const filteredPlayers = players.filter((player: any) => player!!)
  const firstNameArray = filteredPlayers.map((player: any) => player.first_name)

  let counted: any = []
  let countedFirstNameObject: any = {}

  firstNameArray.forEach((answer) => {
    // refer to each item in this array with the parameter "answer"
    if (!counted.includes(answer)) {
      // check if answer is not in counted array
      counted.push(answer) // add the answer to counted [array]
      countedFirstNameObject[answer] = 1 // add answer to result{object} as a key with a value of 1
    } else if (counted.includes(answer)) {
      // here we check if answer is in counted [array]

      // if it's true, that means we have already set its value in the result{object} to 1
      countedFirstNameObject[answer] += 1 // now, we just need to increment its value by 1
    }
  })

  let countedFirstNameArray = []
  for (var name in countedFirstNameObject) {
    countedFirstNameArray.push([name, countedFirstNameObject[name]])
  }

  countedFirstNameArray.sort(function (a, b) {
    return b[1] - a[1]
  })

  return countedFirstNameArray.filter((name) => name[1] > 2)
}

export const getSecondNames = (playerIds: Array<string>) => {
  const players = playerIds.map((playerId: string) => findNFLPlayerWithId(Number(playerId)))
  const filteredPlayers = players.filter((player: any) => player!!)
  const firstNameArray = filteredPlayers.map((player: any) => player.last_name)

  let counted: any = []
  let countedFirstNameObject: any = {}

  firstNameArray.forEach((answer) => {
    // refer to each item in this array with the parameter "answer"
    if (!counted.includes(answer)) {
      // check if answer is not in counted array
      counted.push(answer) // add the answer to counted [array]
      countedFirstNameObject[answer] = 1 // add answer to result{object} as a key with a value of 1
    } else if (counted.includes(answer)) {
      // here we check if answer is in counted [array]

      // if it's true, that means we have already set its value in the result{object} to 1
      countedFirstNameObject[answer] += 1 // now, we just need to increment its value by 1
    }
  })

  let countedFirstNameArray = []
  for (var name in countedFirstNameObject) {
    countedFirstNameArray.push([name, countedFirstNameObject[name]])
  }

  countedFirstNameArray.sort(function (a, b) {
    return b[1] - a[1]
  })

  return countedFirstNameArray.filter((name) => name[1] > 2)
}
