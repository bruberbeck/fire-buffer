const testData = require('./data/data');

const GeoFire = require('geofire').GeoFire;
const FireBuffer = require('../FireBuffer');
const admin = require('firebase-admin');
const expect = require('chai').expect;

(function _init() {
  // Initialize Firebase.
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
    databaseURL: testData.dbUrl
  });
}());

const bufferTestRadius = testData.bufferTestRadius;

const pointTestSections = testData.pointTestSections;
const pointTestInPoints = testData.pointTestInPoints;
const pointTestOutPoints = testData.pointTestOutPoints;

const polylineTestSections = testData.polylineTestSections;
const polylineTestSectionsReversed = testData.polylineTestSectionsReversed;
const polylineTestInPoints = testData.polylineTestInPoints;
const polylineTestOutPoints = testData.polylineTestOutPoints;

class TestHelpers {
  static getResultLocations(results) {
    return results.map(r => [...r.queryResult.values()]).reduce((accum, arr) =>
      accum.concat(arr));
  }

  static getUniqueResultLocations(results) {
    let allLocations = TestHelpers.getResultLocations(results);

    return [...allLocations.reduce((map, val) => {
        if (!map.has(val.key)) {
            map.set(val.key, val);
        }
        return map;
      }, new Map()).values()];
  }

  static catchError(error) {
    console.log(error.message);
  }
}

describe('FireBuffer', function() {
  describe('.constructor()', function() {
    it('should throw an error on initialization with an object of type other than GeoFire', function() {
      expect(function() { new FireBuffer(1); }).to.throw(Error);
      expect(function() { new FireBuffer(undefined); }).to.throw(Error);
      expect(function() { new FireBuffer(''); }).to.throw(Error);
    });
  });

  describe('.analyze()', function() {
    let firebaseRef, geoFireRef, fireBuffer;

    before(function() {
      firebaseRef = admin.database().ref('/').push();
      geoFireRef = new GeoFire(firebaseRef);
      fireBuffer = new FireBuffer(geoFireRef);
    });

    after(function() {
      firebaseRef.remove().then(function() {
        return new Promise((resolve) => {
          setTimeout(function() {
            fireBuffer = null;
            resolve();
          }, 100);
        });
      });
    });

    it('should throw an error on invalid bufferWidth argument', function() {
      expect(function() { fireBuffer.analyze(pointTestSections, 'bufferWidth'); })
        .to.throw(Error);
      expect(function() { fireBuffer.analyze(pointTestSections, 0.09); })
        .to.throw(Error);
    });
  });

  describe('.analyze(points)', function() {
    let firebaseRef, geoFireRef, fireBuffer;

    before(function() {
      firebaseRef = admin.database().ref('/').push();
      geoFireRef = new GeoFire(firebaseRef);
      fireBuffer = new FireBuffer(geoFireRef);

      pointTestInPoints.forEach(tip => geoFireRef.set(tip.key, tip.location));
      pointTestOutPoints.forEach(tip => geoFireRef.set(tip.key, tip.location));
    });

    after(function() {
      firebaseRef.remove().then(function() {
        return new Promise((resolve) => {
          setTimeout(function() {
            fireBuffer = null;
            resolve();
          }, 100);
        });
      });
    });

    it('should report all points that are within the buffer zone of a point', function() {
      fireBuffer.analyze(pointTestSections, bufferTestRadius)
        .then(function(results) {
          let inPoints = TestHelpers.getUniqueResultLocations(results);
          expect(inPoints).to.have.deep.members(pointTestInPoints);
          expect(inPoints).to.not.have.deep.members(pointTestOutPoints);
        })
        .catch(TestHelpers.catchError);
    });
  });

  describe('.analyze(polyline)', function() {
    let firebaseRef, geoFireRef, fireBuffer;

    before(function() {
      firebaseRef = admin.database().ref('/').push();
      geoFireRef = new GeoFire(firebaseRef);
      fireBuffer = new FireBuffer(geoFireRef);

      polylineTestInPoints.forEach(tip => geoFireRef.set(tip.key, tip.location));
      polylineTestOutPoints.forEach(tip => geoFireRef.set(tip.key, tip.location));
    });

    after(function() {
      firebaseRef.remove().then(function() {
        return new Promise((resolve) => {
          setTimeout(function() {
            fireBuffer = null;
            resolve();
          }, 100);
        });
      });
    });

    it('should report all points that are within the buffer zone of a polyline', function() {
      fireBuffer.analyze(polylineTestSections, bufferTestRadius)
        .then(function(results) {
          let inPoints = TestHelpers.getUniqueResultLocations(results);
          expect(inPoints).to.have.deep.members(polylineTestInPoints);
          expect(inPoints).to.not.have.deep.members(polylineTestOutPoints);
        })
        .catch(TestHelpers.catchError);
    });

    it('should report all points that are within the buffer zone of a reversed polyline', function() {
      fireBuffer.analyze(polylineTestSectionsReversed, bufferTestRadius)
        .then(function(results) {
          let inPoints = TestHelpers.getUniqueResultLocations(results);
          expect(inPoints).to.have.deep.members(polylineTestInPoints);
          expect(inPoints).to.not.have.deep.members(polylineTestOutPoints);
        })
        .catch(TestHelpers.catchError);
    });
  });
});
