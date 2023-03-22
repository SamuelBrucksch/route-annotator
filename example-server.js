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
  const port = process.env.ANNOTATOR_PORT || 5055;

  const annotator = new bindings.Annotator();

  const app = express();
  app.use(express.json({limit: '5mb'}));
  app.post("/nodelist", nodeListHandler(annotator));

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

      const tags = []
      async.each(
        wayIds,
        (way_id, next) => {
          if (way_id === null) {
            tags.push(null)
            return next();
          }
          annotator.getAllTagsForWayId(way_id, (err, tagsForWay) => {
            if (err) res.sendStatus(400);
            tags.push([tagsForWay.maxspeed ?? null, tagsForWay["maxspeed:conditional"] ?? null, tagsForWay.tunnel ? 1 : 0, tagsForWay.bridge ? 1 : 0])
            next();
          });
        },
        (err, data) => {
          const endTime = Date.now() - startTime;
          console.log("Request took", endTime, "ms")
          res.json(tags);
        }
      );
    });
  };
}

if (require.main === module) {
  main();
}
