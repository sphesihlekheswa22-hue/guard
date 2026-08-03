const Notification = require("../models/notifications");

exports.getNotifications = async (req, res) => {
  const data = await Notification.find({ userId: req.user.id });
  res.json(data);
};

exports.markAsRead = async (req, res) => {
  const notif = await Notification.findByIdAndUpdate(
    req.params.id,
    { read: true },
    { returnDocument: 'after' }
  );

  res.json(notif);
};
