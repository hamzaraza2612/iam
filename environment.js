require("dotenv").config();
const development = () => ({
  ALLOWED_ORIGINS: [process.env.ALLOWED_ORIGIN_IP, "0.0.0.0", "localhost"],
  OPENSTACK_KEYSTONE_URL: process.env.OPENSTACK_KEYSTONE_URL,
  PORT: process.env.PORT,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
});

module.exports = (typeOfConfig) => {
  if (typeOfConfig === "production") {
    return {
      ALLOWED_ORIGINS: process.env["ALLOWED_ORIGINS"],
      OPENSTACK_KEYSTONE_URL: process.env["OPENSTACK_KEYSTONE_URL"],
      PORT: process.env["PORT"],
    };
  } else if (typeOfConfig === "development") {
    return development();
  }
};
