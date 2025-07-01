module.exports = function ({ dispatch, application }) {
  let active = true // Default to ON

  /**
   * Handles the membership command to toggle fake membership.
   */
  const handleMembershipCommand = async () => {
    active = !active

    if (active) {
      dispatch.serverMessage('Fake membership enabled! This will take effect on your next login.')
      console.log('[Membership] Fake membership ON. Re-login to see changes.')
    } else {
      dispatch.serverMessage('Fake membership disabled. This will take effect on your next login.')
      console.log('[Membership] Fake membership OFF. Re-login to see changes.')
    }
  }

  /**
   * Handles the login message.
   */
  const handleLoginMessage = ({ message }) => {
    if (!active) return // Only modify login when plugin is active

    const { params } = message.value.b.o
    params.accountType = 2
  }

  /**
   * Hooks the login packet.
   */
  dispatch.onMessage({
    type: 'aj',
    message: 'login',
    callback: handleLoginMessage
  })

  /**
   * Register the membership toggle command.
   */
  dispatch.onCommand({
    name: 'membership',
    description: 'Toggle fake membership ON/OFF (does not show up for others, you cannot buy member items).',
    callback: handleMembershipCommand
  })
}
