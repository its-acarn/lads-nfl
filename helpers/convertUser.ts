import { UserSelectOption } from '../types/User'

export const convertUser = (user: any) => {
  const userSelectOption: UserSelectOption = {
    value: user.user_id,
    label: user.display_name,
  }

  return userSelectOption
}
