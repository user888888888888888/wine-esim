const express = require('express');
const { requireTelegramAuth } = require('../telegramAuth');
const { getOrCreateUser, getBalance } = require('../services/users');

const router = express.Router();

router.post('/telegram', requireTelegramAuth, (req, res) => {
  const tgu = req.telegramUser;
  const user = getOrCreateUser({
    telegramId: tgu.telegramId,
    username: tgu.username,
    firstName: tgu.firstName,
    lastName: tgu.lastName,
  });
  if (user.is_blocked) {
    return res.status(403).json({ ok: false, error: 'cuenta_bloqueada' });
  }
  res.json({
    ok: true,
    user: { telegramId: tgu.telegramId, username: tgu.username, firstName: tgu.firstName },
    balance: getBalance(user.id),
  });
});

module.exports = router;
