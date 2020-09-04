require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const request = require("umi-request").default;
var cors = require("cors");
var getScopedToken = require("./getScopedToken");
const getDetailOfLoggedInUser = require("./loggedInUserDetail");
const { loadEnviromentVariables } = require("./loadEnviromentVariables");
const Console = require("ivolve-cloud7-logger");

const app = loadEnviromentVariables()(express());
app.use(cors());
if (process.env["NODE_ENV"] === "development") {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
}

const enviroment = app.get("ENV");
const endPoints = {
  KEYSTONEAUTH: `${enviroment.OPENSTACK_KEYSTONE_URL}/auth/tokens/`,
  DOMAINSCOPES: `${enviroment.OPENSTACK_KEYSTONE_URL}/auth/domains`,
  PROJECTSCOPES: `${enviroment.OPENSTACK_KEYSTONE_URL}/auth/projects`,
  USERENDPOINT: `${enviroment.OPENSTACK_KEYSTONE_URL}/users`,
};

async function createUserProject(body) {
  try {
    const result = await request.post(endPoints.KEYSTONEAUTH, {
      data: {
        auth: {
          identity: {
            methods: ["password"],
            password: {
              user: {
                name: `${enviroment.ADMIN_USERNAME}`,
                password: `${enviroment.ADMIN_PASSWORD}`,
                domain: {
                  name: `Default`,
                },
              },
            },
          },
          scope: "unscoped",
        },
      },
      headers: {
        "Content-Type": "application/json",
      },
      getResponse: true,
    });
    // console.log('login body',data)

    const unscopedToken = result.response.headers._headers["x-subject-token"];
    const token = await getScopedToken(endPoints, unscopedToken, "");

    const createProject = await request.post(
      `${process.env.OPENSTACK_KEYSTONE_URL}/projects`,
      {
        data: {
          project: {
            domain_id: "default",
            enabled: true,
            is_domain: false,
            name: `${body.marketplace.userData.token.user.name}-project`,
            tags: ["permanent"],
          },
        },
        headers: {
          "content-type": "application/json",
          "X-Auth-Token": token.tokenMetadata.tokenId,
        },
      }
    );

    const fetchRoles = await request.get(
      `${process.env.OPENSTACK_KEYSTONE_URL}/roles`,
      {
        headers: {
          "content-type": "application/json",
          "X-Auth-Token": token.tokenMetadata.tokenId,
        },
      }
    );
    let projectId = createProject.project.id;
    let memberRole = fetchRoles.roles.filter((role) => role.name === "member");
    let roleId = memberRole[0].id;
    let userId = body.marketplace.userData.token.user.id;
    const assignRoleToUserOnProject = await request.put(
      `${process.env.OPENSTACK_KEYSTONE_URL}/projects/${projectId}/users/${userId}/roles/${roleId}`,
      {
        headers: {
          "content-type": "application/json",
          "X-Auth-Token": token.tokenMetadata.tokenId,
        },
      }
    );

    return assignRoleToUserOnProject;
  } catch (ex) {
    return { error: "Please Contact Administrator" };
  }
}

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.options(
  "/auth/change-project",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);
app.post(
  "/auth/change-project",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;

    try {
      const projectScopedToken2 = await request.post(endPoints.KEYSTONEAUTH, {
        getResponse: true,

        data: {
          auth: {
            identity: {
              methods: ["token"],
              token: {
                id: body.unscopedToken,
              },
            },
            scope: {
              project: {
                id: body.project_id,
              },
            },
          },
        },
      });

      const { data } = projectScopedToken2;

      if (data.token.project !== undefined && Array.isArray(data.token.roles)) {
        let allData = {
          tokenMetadata: {
            tokenId:
              projectScopedToken2.response.headers._headers[
                "x-subject-token"
              ][0],
            scope: "projectScope",
          },
          ...projectScopedToken2.data,
        };
        const currentLoggedInUserDetail = await getDetailOfLoggedInUser(
          projectScopedToken2.response.headers._headers["x-subject-token"][0],
          projectScopedToken2.data.token.user.id,
          endPoints.USERENDPOINT
        );
        res.status(projectScopedToken2.response.status).json({
          tokenMetadata: {
            tokenId:
              projectScopedToken2.response.headers._headers[
                "x-subject-token"
              ][0],
            scope: "projectScope",
          },
          userDetails: currentLoggedInUserDetail.userDetails,
          ...projectScopedToken2.data,
        });
      } else {
        res.status(projectScopedToken2.response.status).json({
          tokenMetadata: {
            tokenId:
              projectScopedToken2.response.headers._headers[
                "x-subject-token"
              ][0],
            scope: "unscoped",
          },
          ...projectScopedToken2.data,
        });
      }
    } catch (e) {
      Console.exception(e);
      res.status(e.data.error.code).json({ body: JSON.stringify(e.data) });
    }
  }
);

app.options(
  "/auth/logout",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "DELETE",
  })
);
app.delete(
  "/auth/logout",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "DELETE",
  }),
  async (req, res) => {
    const { headers } = req;
    const token = headers["x-auth-token"];
    let result = null;

    request
      .delete(endPoints.KEYSTONEAUTH, {
        headers: {
          "X-Auth-Token": token,
          "X-Subject-Token": token,
        },
        getResponse: true,
      })
      .then((response) => {
        result = response;
        res.status(result.response.status).json(result);
      })
      .catch((error) => {
        Console.exception(error);
        result = error;
        res.status(result.response.status).json(result);
      });
  }
);

app.options(
  "/auth/mfa-login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);

app.post(
  "/auth/mfa-login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;
    try {
      const result = await request.post(endPoints.KEYSTONEAUTH, {
        data: {
          auth: {
            identity: {
              methods: ["totp"],
              totp: {
                user: {
                  id: body.user_id,
                  passcode: body.passcode,
                },
              },
            },
          },
        },

        headers: {
          "Content-Type": "application/json",
          "openstack-auth-receipt": body.Openstack_Auth_Reciept,
        },
        getResponse: true,
      });

      const unscopedToken = result.response.headers._headers["x-subject-token"];

      const scopedToken = await getScopedToken(endPoints, unscopedToken, body);

      if (scopedToken.hasOwnProperty("body")) {
        res.status(404).json(scopedToken);
      } else {
        res.status(result.response.status).json(scopedToken);
      }
    } catch (e) {
      Console.exception(e);
      if (e.response.statusText === "UNAUTHORIZED") {
        res
          .status(e.response.status)
          .json({ body: { message: "Passcode Incorrect." } });

        return;
      } else {
        res
          .status(e.response.status)
          .json({ body: { message: "Bad request." } });
        return;
      }
    }
  }
);

app.post("/auth/marketplace", async (req, res, next) => {
  try {
    const { headers, body } = req;
    const unscopedToken = [headers["x-auth-token"]];

    const allProjects = await request.get(endPoints.PROJECTSCOPES, {
      getResponse: true,
      headers: {
        "X-Auth-Token": unscopedToken[0],
        "X-Subject-Token": unscopedToken[0],
      },
    });
    let createdProject = null;

    if (allProjects.data.projects.length === 0) {
      createdProject = await createUserProject(body);
      if (createdProject.error) {
        res.status(400).json({ body: { message: createdProject.error } });
        return;
      }
    }

    const scopedToken = await getScopedToken(endPoints, unscopedToken, "");
    if (scopedToken.hasOwnProperty("body")) {
      res.status(404).json(scopedToken);
    } else {
      res.status(200).json(scopedToken);
    }
  } catch (e) {
    if (e.response.headers._headers.hasOwnProperty("openstack-auth-receipt")) {
      res.status(200).json({
        "Openstack-Auth-Reciept":
          e.response.headers._headers["openstack-auth-receipt"][0],
        user_id: e.data.receipt.user["id"],
      });
    } else {
      res.status(400).json({ body: { message: "Invalid Credentials" } });
    }
  }
});

app.options(
  "/auth/login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);
app.post(
  "/auth/login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;
    Console.log("body", body);

    try {
      const result = await request.post(endPoints.KEYSTONEAUTH, {
        data: {
          auth: {
            identity: {
              methods: ["password"],
              password: {
                user: {
                  name: `${body.username}`,
                  password: `${body.password}`,
                  domain: {
                    name: `Default`,
                  },
                },
              },
            },
            scope: "unscoped",
          },
        },
        headers: {
          "Content-Type": "application/json",
        },
        getResponse: true,
      });
      // console.log('login body',data)
      Console.log("result....", result);

      const unscopedToken = result.response.headers._headers["x-subject-token"];
      const scopedToken = await getScopedToken(endPoints, unscopedToken, body);
      if (scopedToken.hasOwnProperty("body")) {
        res.status(404).json(scopedToken);
      } else {
        res.status(result.response.status).json(scopedToken);
      }
    } catch (e) {
      Console.exception(e);
      if (
        e.response.headers._headers.hasOwnProperty("openstack-auth-receipt")
      ) {
        res.status(200).json({
          "Openstack-Auth-Reciept":
            e.response.headers._headers["openstack-auth-receipt"][0],
          user_id: e.data.receipt.user["id"],
        });
      } else {
        res
          .status(e.data.error.code)
          .json({ body: { message: "Invalid Credentials" } });
      }
    }
  }
);
app.options(
  "/auth/signup",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);

app.post(
  "/auth/signup",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;
    Console.log("body", body);
    try {
      const admin_login = await request.post(endPoints.KEYSTONEAUTH, {
        data: {
          auth: {
            identity: {
              methods: ["password"],
              password: {
                user: {
                  name: enviroment.ADMIN_USERNAME,
                  domain: {
                    id: "default",
                  },
                  password: enviroment.ADMIN_PASSWORD,
                },
              },
            },
          },
          scope: {
            project: {
              domain: {
                id: "default",
              },
              name: "marketplace",
            },
          },
        },
        getResponse: true,
      });

      const result = await request.post(`${endPoints.USERENDPOINT}`, {
        data: {
          user: {
            name: `${body.body.name}`,
            email: `${body.body.email}`,
            password: `${body.body.password}`,
          },
        },
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": admin_login.response.headers._headers[
            "x-subject-token"
          ].toString(),
        },
        getResponse: true,
      });
      return res.json(result.response);
    } catch (e) {
      Console.exception(e);
      const responseError = e.response.status;

      if (responseError === 401) {
        res.json({ status: 401, body: { message: "Invalid Credentials" } });
      }
      res.json({ status: e.code, body: { message: e.message } });
    }
  }
);

app.options(
  "/auth/changepasswordfirstlogin",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);
app.post(
  "/auth/changepasswordfirstlogin",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;
    Console.log("body", body);
    const { user_id } = body;

    try {
      const result = await request.post(
        `${endPoints.USERENDPOINT}/${user_id}/password`,
        {
          data: {
            user: {
              password: `${body.new_password}`,
              original_password: `${body.old_password}`,
            },
          },
          headers: {
            "Content-Type": "application/json",
          },
          getResponse: true,
        }
      );

      const changepasswordStatus = result.response.status;

      res.json(result.response);
    } catch (e) {
      Console.exception(e);
      const responseError = e.response.status;

      if (responseError === 401) {
        res.json({ status: 401, body: { message: "Invalid Credentials" } });
      }
    }
  }
);

app.get("/auth/marketplace-token", async (req, res, next) => {
  const { headers } = req;
  const authToken = headers["x-auth-token"];

  try {
    const headers = {
      "X-Auth-Token": authToken,
      "X-Subject-Token": authToken,
    };
    const result = await request.get(endPoints.KEYSTONEAUTH, {
      headers,
      getResponse: true,
    });

    if (!result.project) {
      result.data["firstTime"] === true;
    }

    res.status(200).json({ ...result.data });
  } catch (e) {
    Console.exception(e);
    const { code } = e.data.error;
    res.status(code).json({ ...e.data.error });
  }
});

app.get(
  "/auth/verify-token",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "GET",
    allowedHeaders: ["x-auth-token"],
  }),
  async (req, res, next) => {
    const { headers } = req;
    const authToken = headers["x-auth-token"];

    try {
      const headers = {
        "X-Auth-Token": authToken,
        "X-Subject-Token": authToken,
      };
      const result = await request.get(endPoints.KEYSTONEAUTH, {
        headers,
        getResponse: true,
      });

      res.status(200).json({ ...result.data });
    } catch (e) {
      Console.exception(e);
      const { code } = e.data.error;
      res.status(code).json({ ...e.data.error });
    }
  }
);

// Login controller for marketplace
app.options(
  "/auth/marketplace/login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  })
);
app.post(
  "/auth/marketplace/login",
  cors({
    origin: enviroment.ALLOWED_ORIGINS,
    methods: "POST",
  }),
  async (req, res, next) => {
    const { body } = req;
    Console.log("body", body);

    try {
      const result = await request.post(endPoints.KEYSTONEAUTH, {
        data: {
          auth: {
            identity: {
              methods: ["password"],
              password: {
                user: {
                  name: `${body.username}`,
                  password: `${body.password}`,
                  domain: {
                    name: `Default`,
                  },
                },
              },
            },
            scope: "unscoped",
          },
        },
        headers: {
          "Content-Type": "application/json",
        },
        getResponse: true,
      });
      // console.log('login body',data)
      Console.log("result....", result);

      const unscopedToken = result.response.headers._headers["x-subject-token"];
      const user = result.data.token.user;
      return res.status(200).json({
        body: {
          message: "Login successfull",
          token: unscopedToken,
          user: user,
        },
      });
    } catch (e) {
      Console.exception(e);
      if (
        e.response.headers._headers.hasOwnProperty("openstack-auth-receipt")
      ) {
        return res.status(200).json({
          "Openstack-Auth-Reciept":
            e.response.headers._headers["openstack-auth-receipt"][0],
          user_id: e.data.receipt.user["id"],
        });
      } else {
        return res
          .status(e.data.error.code)
          .json({ body: { message: "Invalid Credentials" } });
      }
    }
  }
);

app.use(function (err, req, res, next) {
  res.status(err.status || 500).json(err);
});
module.exports = app;
