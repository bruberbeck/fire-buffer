# FireBuffer

A spatial buffer analysis implementation around [Firebase Realtime Database](https://firebase.google.com/docs/database/) [GeoFire's JavaScript port](https://github.com/firebase/geofire-js).

FireBuffer is a promise based, micro wrapper around Firebase GeoFire aiming to
provide contextually much needed buffer analysis capability.

## Table of Contents

 * [Installation](#installation)
 * [Usage](#usage)
 * [Testing](#testing)
 * [Implementation Details](#implementation-details)
 * [Disclaimer](#disclaimer)

## Installation

It is possible to install FireBuffer as a npm package.

```bash
$ npm install fire-buffer
```

## Usage

FireBuffer needs a GeoFire object representing a GeoFire node in a Firebase
Realtime Database. Once created, FireBuffer performs its buffer analysis
through calls to its **analyze** method. The **analyze** method takes a polyline
denoted as an array of line segments as its first parameter. Each line segment
is assumed to be represented as an array of latitude-longitude pairs. These
latitude-longitude point pairs should be present as numeric values in arrays
with a length of two. Second parameter of the **analyze** method is the radius
of the buffer that will span along the full lengths of the lines making up the
polyline in its first argument. Buffer radius should be in meters. A sample
usage of the FireBuffer could look like this:

```javascript
const admin = require('firebase-admin');
const GeoFire = require('geofire').GeoFire;
const FireBuffer = require('fire-buffer');
const polylineSections = [ [
    [ 40.93120829520155, 28.919543097753376 ],
    [ 40.93121929589677, 28.92192113192982 ],
    [ 40.93123024773927, 28.92429916689639 ],
  ],
  [ [ 40.93123024773927, 28.92429916689639 ],
    [ 40.929433617171036, 28.92429916689639 ],
    [ 40.92763698660279, 28.92429916689639 ],
  ],
  [ [ 40.92763698660279, 28.92429916689639 ],
    [ 40.92584035603456, 28.92429916689639 ],
    [ 40.924043725466326, 28.92429916689639 ],
  ],
];

(function _init() {
  // Initialize Firebase.
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
    databaseURL: "https://database_subdomain.firebaseio.com"
  });
}());

let firebaseRef = admin.database().ref('/').push();
let geoFireRef = new GeoFire(firebaseRef);
let fireBuffer = new FireBuffer(geoFireRef);
fireBuffer.analyze(polylineSections, 100)
  .then(results => {
    // Process query result...
  });
```

Note that initializing the Firebase is the developer's responsibility.
The result of a buffer analysis is delivered through a promise. The result
object passed to the promise resolver is an array of query results, where each
element holds the query and query result information for every line segment
that has been passed to the **analyze** method. A query result is made up of
two properties: **querySection** and **queryResult**.
**queryResult.querySection** is an object that holds query information for its
associated line segment (i.e. start, end points, line segment distance and
points over which circular buffer analysis have been performed to simulate a
linear buffer analysis along the length of that line segment).
**queryResult.queryResult** is a
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
of GeoFire keys pointing to objects of GeoFire key and location pairs. A sample usage of
buffer analysis could be as follows:

```javascript
fireBuffer.analyze(polylineSections, 100)
  .then(results => {
    for (let result of results) {
      // Process querySection.
      processLineStartPoint(result.querySection.start);
      processLineEndPoint(result.querySection.end);
      processLineDistance(result.querySection.distance);
      // querySection.queryPolyline is an array of arrays of latitude-longitude
      // pairs, holding the locations where individual circular buffer analysis
      // have been performed by the FireBuffer.
      processQueryPoints(result.querySection.queryPolyline);

      // Process queryResult.
      for (let key of result.queryResult.keys()) {
        let value = result.queryResult.get(key);
        processQueryResultKey(value.key);
        processQueryResultLocation(value.location);
      }
    }
  });
```

## Testing

In order to be tested FireBuffer requires what Firebase terms a "Service Account Key"
that can be found at this address: [https://console.firebase.google.com/project/YOUR_PROJECT_ID/settings/serviceaccounts/adminsdk]. Make sure that service account key file is present in the [test directory](./test/) under the name "serviceAccountKey.json," or provide it in a manner that suits you better and make sure to update the service account key path used in the [FireBuffer.test.js](./test/FireBuffer.test.js). The final thing FireBuffer needs to be tested is a database URL. FireBuffer
uses the database information to write its test locations to, under a custom generated
node. Therefore, testing will not be interfering with the existent data in the provided database.
One can set the database URL on the [test data file](./test/data/data.js), under the exported
object's **dbUrl** property.


## Implementation Details

FireBuffer assumes that it and its underlying GeoFire library can be safely used to sub-meter accuracy. FireBuffer enforces this assumption by, during a buffer analysis, marking any location that is off by 0.1 meters to be within the buffer zone. As such, buffer radius arguments provided to **analyze** method can not be smaller than 0.1 meters.

FireBuffer works by simulating a linear buffer along a polyline through the employment of a series of circular buffer queries spaced in such a way that their intersections will include points that are off by buffer width distances from the reference polyline. Achieving this is made possible by making the series of circular buffers simulating a linear buffer wider than the provided buffer width. As such, FireBuffer requires a second mechanism on top of the GeoFire query to calculate the distances of points that fall within the individual buffers and to ensure that these distances measuring to the reference polyline are indeed smaller or approximately equal to the query's buffer width. To mend this situation, FireBuffer resorts to two-dimensional trigonometry equations. What this means that **you should ONLY use FireBuffer for cases warranting low-accuracy, and with small buffer widths where Earth's curvature will have negligible effects.** Otherwise, be prepared to faulty outcome.

Another limitation that will arise whilst using FireBuffer regards to its performance: FireBuffer is slow. Initial querying of a polyline of 4 kilometers on a non-indexed GeoFire reference takes approximately 1 second on a 2,3 GHz Intel Core i5. The slowness stems from a seeming bug in GeoFire: it is not possible to update a [GeoFire query](https://github.com/firebase/geofire-js/blob/master/docs/reference.md#geoquery)(GeoQuery) with new locations, through repeating calls using its ["ready" event](https://github.com/firebase/geofire-js/blob/master/docs/reference.md#geoqueryoneventtype-callback), and still get its ["key_entered" event](https://github.com/firebase/geofire-js/blob/master/docs/reference.md#geoqueryoneventtype-callback) fired to be informed about the locations that fall within the updated GeoQuery. FireBuffer overcomes this situation by repeatedly creating GeoQueries, instead of repeatedly updating a single GeoQuery.

## Disclaimer

As implied above, FireBuffer is not a production ready library. Use FireBuffer only if approximation suits your needs.
