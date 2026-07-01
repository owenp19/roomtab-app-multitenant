const db = require("../config/db");

async function getAllRooms(tenantId) {
  var tid = Number(tenantId) || 1;
  return await db.query(
    `SELECT
        r.id,
        r.room_number AS roomNumber,
        f.id AS floorId,
        f.name AS floorName
     FROM rooms r
     INNER JOIN floors f ON f.id = r.floor_id
     WHERE r.tenant_id = ? AND f.tenant_id = ?
     ORDER BY f.floor_number, CAST(r.room_number AS UNSIGNED)`,
    [tid, tid]
  );
}

module.exports = {
  getAllRooms
};
