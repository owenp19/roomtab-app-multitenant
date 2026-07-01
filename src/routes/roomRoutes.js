const express = require("express");
const roomRepository = require("../repositories/roomRepository");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const rooms = await roomRepository.getAllRooms(req.tenantId);
    res.json(rooms);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

