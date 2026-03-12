module.exports = (req, res) => {
  res.json({ ok: true, env: !!process.env.MONGO_URI, node: process.version });
};
