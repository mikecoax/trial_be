const express = require('express');
const router = express.Router();
const { Client } = require('@elastic/elasticsearch')
const fs = require('fs');
const AWS = require("aws-sdk");
const { unzip } = require("zlib");
const { promisify } = require("util");
const do_unzip = promisify(unzip);

AWS.config.update({
  accessKeyId: process.env.SERVICE_KEY_ID,
  secretAccessKey: process.env.SERVICE_ACCESS_KEY,
  region: "us-east-1"
});
const bucketName = 'rg-exports';
const s3 = new AWS.S3();

const client = new Client({node: 'http://localhost:9200',})

router.post('/process-catalog', async function(req, res) {
  const { Contents } = await s3.listObjects({
    Bucket:  bucketName,
    Prefix: "full-export/prod/partners367/movies/",
  })
    .promise()
  for await (const c of Contents) {
    const file = await s3.getObject({
      Bucket: bucketName,
      Key: c.Key
    }).promise();

    const data = await do_unzip(file.Body) // unzip from buffer with .gz file
      .then(buf => buf.toString())
      .catch((err) => {
        console.error("An error occurred:", err);

        return "";
      });

    const splitedData = data.split(/(?:\r\n|\r|\n)/g) //splitting by strings, one string should contain json
    const rgJSON = splitedData.map(s => s ? JSON.parse(s) : null).filter(s => s)

    const movies = rgJSON.map(r => ({ id: r.movie_id, title: r.title, overview: r.overview, imdb: r.imdb, popularity: r.popularity }))

    for await (const movie of movies) {
      await client.index({
        index: "movies-autocomplete",
        document: {
          "id": movie.id,
          "title": movie.title,
          "overview": movie.overview,
          "imdb": movie.imdb,
          "popularity": movie.popularity,
        },
      })
    }
  }

  return res.json({ data: Contents })
})

router.post('/create-index', async function(req, res, next) {
  const indexExists = await client.indices.exists({ index: 'movies-autocomplete' })
  if(indexExists) {
    return res.status(400).json({ message: 'index exists'});
  }
  await client.indices.create({ index: 'movies-autocomplete'});
  const d = await client.indices.putMapping({
    index: 'movies-autocomplete',
    body: {
      properties: {
        title: {
          type: "search_as_you_type"
        },
        overview: {
          type: "search_as_you_type"
        },
        popularity: {
          type: 'double'
        },
        imdb: {
          type:  "keyword"
        }
      }
    }
  })


  res.json({ data: d });
});

router.get('/autocomplete/:searchString', async function(req, res) {
  const data = await client.search({
    index: 'movies-autocomplete',
    body: {
      query: {
        multi_match: {
          query: req.params['searchString'],
          type: "bool_prefix",
          fields: [
            "title",
            "title._2gram",
            "title._3gram",
            "title._4gram"
          ]
        }
      }
    }
  })

  const hits = data.hits.hits.map(h => ({ id: h._source.id, title: h._source.title, score: h._score }));

  res.json({ hits });
})

router.get('/parse', async function(req, res) {
  const buf = fs.readFileSync('routes/1.txt');
  const data = buf.toString()
  const splitedData = data.split(/(?:\r\n|\r|\n)/g) //splitting by strings, one string should contain json
  const rgJSON = splitedData.map(s => s ? JSON.parse(s) : null).filter(s => s)

  const movies = rgJSON.map(r => ({ id: r.movie_id, title: r.title, overview: r.overview }))
  const rElastic = []
  for await (const movie of movies) {

    rElastic.push(await client.index({
      index: "movies-autocomplete",
      document: {
        "id": movie.id,
        "title": movie.title,
        "overview": movie.overview,
      },
    }))
  }

  res.json({ rElastic })
})

module.exports = router;
