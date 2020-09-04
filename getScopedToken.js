const request = require("umi-request").default;
const Console = require("ivolve-cloud7-logger");
const getDetailOfLoggedInUser = require("./loggedInUserDetail");

module.exports = async (endPoints, unscopedToken, body) => {
  try {
    headers = {
      "X-Auth-Token": unscopedToken[0],
    };
    const allProjects = await request.get(endPoints.PROJECTSCOPES, {
      getResponse: true,
      headers: {
        "X-Auth-Token": unscopedToken[0],
        "X-Subject-Token": unscopedToken[0],
      },
    });
    if (allProjects.data.projects.length === 0) {
      const no_project_assigned = {
        body: { message: "User does not have a project assigned to it" },
      };
      return no_project_assigned;
    }
    const firstProject = allProjects.data.projects[0];
    const projectScopedToken = await request.post(endPoints.KEYSTONEAUTH, {
      getResponse: true,
      data: {
        auth: {
          identity: {
            methods: ["token"],
            token: {
              id: unscopedToken[0],
            },
          },
          scope: {
            project: {
              id: firstProject.id,
            },
          },
        },
      },
    });

    const { data } = projectScopedToken;

    if (data.token.project !== undefined && Array.isArray(data.token.roles)) {
      let allData = {
        tokenMetadata: {
          tokenId:
            projectScopedToken.response.headers._headers["x-subject-token"][0],
          scope: "projectScope",
        },
        ...projectScopedToken.data,
        allProjects: allProjects.data.projects,
      };
      const currentLoggedInUserDetail = await getDetailOfLoggedInUser(
        projectScopedToken.response.headers._headers["x-subject-token"][0],
        projectScopedToken.data.token.user.id,
        endPoints.USERENDPOINT
      );
      const response_status = {
        tokenMetadata: {
          tokenId:
            projectScopedToken.response.headers._headers["x-subject-token"][0],
          scope: "projectScope",
        },
        ...projectScopedToken.data,
        allProjects: allProjects.data.projects,
        userDetails: currentLoggedInUserDetail.userDetails,
        unscopedToken: unscopedToken[0],
      };

      return response_status;
    } else {
      const response_status = {
        tokenMetadata: {
          tokenId:
            projectScopedToken.response.headers._headers["x-subject-token"][0],
          scope: "unscoped",
        },
        ...projectScopedToken.data,
      };
      return response_status;
    }
  } catch (error) {
    Console.exception(error);
    const displayError = {
      body: {
        message:
          error.message ||
          error.data.error.message ||
          "Please contact administrator",
      },
    };
    return displayError;
  }
};
