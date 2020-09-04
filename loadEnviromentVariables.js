module.exports.loadEnviromentVariables = () => {
  require("dotenv").config();
  const env = process.env["NODE_ENV"];

  const enviroment = require("./environment")(env);

  module.exports.enviroment = enviroment;

  return app => {
    app.set("ENV", enviroment);
    return app;
  };
};
