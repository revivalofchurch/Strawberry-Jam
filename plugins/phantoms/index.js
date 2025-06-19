module.exports = function ({ dispatch, application }) {

  const log = (type, msg) => application.consoleMessage({ type, message: msg });

  let currentRoom = dispatch.getState('room') || '0';
  const refreshRoom = () => {
    const latest = dispatch.getState('room') || '0';
    if (latest !== currentRoom) currentRoom = latest;
  };

  const sequenceFns = [
    r => `%xt%o%qx%${r}%%`,
    r => `%xt%o%qj%${r}%stagingQuestadventures.queststaging_421_0_585_11672#30%14%1%0%`,
    r => `%xt%o%qs%${r}%dentestofpower%`,
    r => `%xt%o%qpup%${r}%bunny_key_3a%2209994%`,
    r => `%xt%o%qat%${r}%bunny_7%0%`,
    r => `%xt%o%qpup%${r}%bunny_key_3a%2209994%`,
    r => `%xt%o%qat%${r}%bunny_8%0%`,
    r => `%xt%o%qpup%${r}%bunny_key_3a%2209994%`,
    r => `%xt%o%qat%${r}%bunny_9%0%`,
    r => `%xt%o%qpup%${r}%bunny_key_3a%2209994%`,
    r => `%xt%o%qat%${r}%bunny_10%0%`,
    r => `%xt%o%qaskr%${r}%liza_2%1%1%`,
    r => `%xt%o%qpgift%${r}%0%0%0%`,
    r => `%xt%o%qpgift%${r}%1%0%0%`,
    r => `%xt%o%qpgift%${r}%2%0%0%`,
    r => `%xt%o%qpgift%${r}%3%0%0%`,
    r => `%xt%o%qpgift%${r}%4%0%0%`
  ];

  let interval   = null;
  let index      = 0;
  let loopActive = false;
  let sniffing   = false;

  const sendNext = () => {
    refreshRoom();
    dispatch.sendRemoteMessage(sequenceFns[index](currentRoom));
    index = (index + 1) % sequenceFns.length;
  };

  const handleIl = ({ message: { value } }) => {

    if (!sniffing || value.length !== 14) return;

    const slot = value[11], id = value[12];
    if (id === '138' || id === '148' || id === '342') return;

    dispatch.sendRemoteMessage(`%xt%o%ir%${currentRoom}%${slot}%`);
  };

  const startLoop = () => {
    if (loopActive) return;
    refreshRoom();
    index = 0;
    interval = dispatch.setInterval(sendNext, 800);
    loopActive = true;
  };
  const stopAll = () => {
    if (interval) dispatch.clearInterval(interval);
    interval = null;
    loopActive = sniffing = false;
  };

  dispatch.onCommand({
    name: 'phantoms',
    description: 'Farm ROTP and collect prizes! (use `off` to disable filtering).',
    callback: ({ parameters }) => {
      const p = (parameters[0] || '').toLowerCase();
      if (p === 'off') {

        sniffing = false;
        if (!loopActive) startLoop();
        log('success', 'ROTP farm mode enabled without filtering.');
      }
      else if (!p) {

        if (loopActive) {
          stopAll();
          log('warn', 'ROTP farm mode disabled.');
        } else {
          startLoop();
          sniffing = true;
          log('success', 'ROTP farm mode enabled with filtering.');
        }
      }
      else {

        if (loopActive) {
          stopAll();
          log('warn', 'ROTP farm mode disabled.');
        } else {
          startLoop();
          sniffing = true;
          log('success', 'ROTP farm mode enabled with filtering.');
        }
      }
    }
  });

  dispatch.onMessage({ type: 'aj', message: 'il', callback: handleIl });
}
