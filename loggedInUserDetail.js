const request = require("umi-request").default;
const Console = require("ivolve-cloud7-logger");
const getDetailOfLoggedInUser = async (token, user_id, USERENDPOINT) => {
  const headers = {
    "content-type": "application/json",
    "X-Auth-Token": token,
  };
  const userDetails = await request.get(`${USERENDPOINT}/${user_id}`, {
    headers: { ...headers },
  });
  return { userDetails: { ...userDetails.user } };
};

module.exports = getDetailOfLoggedInUser;
