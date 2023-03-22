"use strict";

const bindings = require("./index");
const express = require("express");
const async = require("async");

function main() {
  const argv = process.argv.slice(1);
  const argc = argv.length;

  if (argc < 2) return console.error(`Usage: ${__filename} OSMFILE [TAG FILE]`);

  const osmFile = argv[1];
  const tagFile = argv[2] || "./tags";
  const port = process.env.ANNOTATOR_PORT || 5052;

  const annotator = new bindings.Annotator();

  const app = express();
  app.use(express.json());
  app.post("/nodelist", nodeListHandler(annotator));
  app.post("/coordlist", coordListHandler(annotator));

  annotator.loadOSMExtract(osmFile, tagFile, (err) => {
    if (err) return console.error(err);

    app.listen(port, () => {
      console.log(`Listening on http://localhost:${port}`);
    });
  });
}

const nodeListHandler = (annotator) => {
  return (req, res) => {
    const startTime = Date.now();
    let nodes;
    if (req.body.nodes) {
      // should be an array of numbers
      nodes = req.body.nodes;
    } else {
      return res.sendStatus(400);
    }

    const invalid = (x) => !isFinite(x) || x === null;

    if (nodes.some(invalid)) return res.sendStatus(400);

    annotator.annotateRouteFromNodeIds(nodes, (err, wayIds) => {
      if (err) return res.sendStatus(400);

      const response = { way_indexes: [], ways_seen: [] };
      const way_indexes = {};

      async.each(
        wayIds,
        (way_id, next) => {
          if (way_id === null) return next();
          annotator.getAllTagsForWayId(way_id, (err, tags) => {
            if (err) res.sendStatus(400);
            const wid = tags["_way_id"];
            if (!way_indexes.hasOwnProperty(wid)) {
              way_indexes[wid] = Object.keys(way_indexes).length;
              response.ways_seen.push(tags);
            }
            response.way_indexes.push(way_indexes[wid]);
            next();
          });
        },
        (err, data) => {
          const endTime = Date.now() - startTime;
          console.log("Request took", endTime, "ms")
          res.json(response);
        }
      );
    });
  };
}

const coordListHandler = (annotator) => {
  return (req, res) => {
    let coordinates;
    if (req.body.coordinates) {
      // POST
      // should be an array with arrays of lon/lat pairs
      coordinates = req.body.coordinates;
    } else {
      return res.sendStatus(400);
    }

    const invalid = (x) => !isFinite(x) || x === null;

    if (coordinates.some((lonLat) => lonLat.some(invalid)))
      return res.sendStatus(400);

    annotator.annotateRouteFromLonLats(coordinates, (err, wayIds) => {
      if (err) {
        console.error(err);
        return res.sendStatus(400);
      }

      const response = { way_indexes: [], ways_seen: [] };
      const way_indexes = {};

      async.each(
        wayIds,
        (way_id, next) => {
          annotator.getAllTagsForWayId(way_id, (err, tags) => {
            const wid = tags["_way_id"];
            if (!way_indexes.hasOwnProperty(wid)) {
              way_indexes[wid] = Object.keys(way_indexes).length;
              response.ways_seen.push(tags);
            }
            response.way_indexes.push(way_indexes[wid]);
            next();
          });
        },
        (err, data) => {
          res.json(response);
        }
      );
    });
  };
}

if (require.main === module) {
  main();
}
