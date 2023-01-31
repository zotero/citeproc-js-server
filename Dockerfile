# Docker image for citeproc-node app

FROM node
MAINTAINER <PLEASE-INSERT-MAINTAiNER>

# append nodejs binaries TO PATH
ENV PATH node_modules/.bin:$PATH

# Add source
COPY . citeproc-js-server

WORKDIR citeproc-js-server

# fetch git submodules
RUN git submodule init
RUN git submodule update

RUN npm install

# XML to JSON for optimal performance
RUN ./xmltojson.py ./csl ./csl-json
RUN ./xmltojson.py ./csl-locales ./csl-locales-json

# Override configuration to match above paths
ADD docker/local.json config/local.json

# Expose port
EXPOSE 8085

# run app
CMD ["npm", "start"]
