const prisma = require("../config/prisma");
const { withId } = require("../lib/serialize");

exports.getNotifications = async (req, res) => {
  const data = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(data.map(withId));
};

exports.markAsRead = async (req, res) => {
  const notif = await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true },
  });

  res.json(withId(notif));
};
