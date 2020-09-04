FROM node:10.18-alpine

RUN mkdir iam
COPY . /iam
WORKDIR /iam

RUN npm install

RUN npm install nodemon -g

Expose 8003
CMD ["nodemon"]
