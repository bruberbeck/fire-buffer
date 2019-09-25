'use strict';

const geometry = require('spherical-geometry-js');
const GeoFire = require('geofire').GeoFire;
const LatLng = geometry.LatLng;
const SixtyDegreesInRadians = Math.PI / 3;
const BufferRadiusMin = 0.1; // in meters

class BufferHelpers {
  static moveLatLngBy(latLng, towards, byMeters) {
    let d = geometry.computeDistanceBetween(latLng, towards);
    return geometry.interpolate(latLng, towards, byMeters / d);
  }

  static latLngToArray(latLng) {
    return [ latLng.lat(), latLng.lng() ];
  }

  static arrayToLatLng(latLngArr) {
    return new LatLng(latLngArr[0], latLngArr[1]);
  }

  // Computes the closest distance of the "thirdPoint" to a line represented
  // by startPoint and endPoint.
  static computeClosestDistance(startPoint, endPoint, thirdPoint) {
    // We are going to use the formula C = Arccos ((a2 + b2 - c2) / 2ab) to
    // calculate the angle C, and sin(C) * b formula to calculate the
    // closest distance.
    // a is the length of the line. b and c are the lengths from start and
    // end points to the thirdPoint;

    let startLatLng = BufferHelpers.arrayToLatLng(startPoint),
      endLatLng = BufferHelpers.arrayToLatLng(endPoint),
      thirdLatLng = BufferHelpers.arrayToLatLng(thirdPoint),
      a = geometry.computeDistanceBetween(startLatLng, endLatLng),
      b = geometry.computeDistanceBetween(startLatLng, thirdLatLng),
      c = geometry.computeDistanceBetween(endLatLng, thirdLatLng);

    // Special case. The line is so short that we can use start or end point
    // to calculate the closest distance.
    if (a < 0.1) {
      return b < c ? b : c;
    }
    // Another special case. The thirdPoint is too close.
    if (b < BufferRadiusMin) {
      return b;
    }
    // Another special case. The thirdPoint is too close.
    if (c < BufferRadiusMin) {
      return c;
    }

    let cosB = (a * a + c * c - b * b) / (2 * a * c);
    // Special case. cosB being a negative value means that angle B
    // is greater than 90 degrees. For such a case,
    // we should return the closest distance to the thirdPoint,
    // which is c.
    if (cosB <= 0) {
      return c;
    }

    let cosC = (a * a + b * b - c * c) / (2 * a * b);
    // Special case. cosC being a negative value means that angle C
    // is greater than 90 degrees. For such a case,
    // we should return the closest distance to the thirdPoint,
    // which is b.
    if (cosC <= 0) {
      return b;
    }

    // Another special case. The points are aligned along a line.
    // There is not a meaningful triangle to calculate the angle C.
    if (cosC <= -1 || cosC >= 1) {
      return b < c ? b : c;
    }

    let angleC = Math.acos(cosC);
    // Another special case. The angle is too narrow or too wide.
    // Return the smallest edge.
    if (angleC < 0.0017 || angleC > 3.14) {
      return b < c ? b : c;
    }

    return Math.sin(angleC) * b;
  }

  static toLatLngPolyline(latLngArrPolyline) {
    return latLngArrPolyline.map(latLngArr =>
      new LatLng(latLngArr[0], latLngArr[1]));
  }

  // bufferStepLength is the minimum length to
  // keep a consistent bufferWidth wide buffer
  // along a polyline. This stems from the fact
  // that we are simulating a linear buffer through
  // the intersections of circular buffers.
  // The returned value is the minimum length of
  // a buffer radius the achieve bufferWidth
  // width in the intersections of two adjacent
  // circular buffers.
  static getBufferStepLength(bufferWidth) {
    return bufferWidth / Math.sin(SixtyDegreesInRadians);
  }

  // Calculates and returns the points through which the individual circular
  // buffer analysis will be carried out to simulate a linear buffer analysis.
  static getQuerySection(polyline, bufferStepLength) {
    polyline = BufferHelpers.toLatLngPolyline(polyline);
    let startPoint = polyline[0],
      endPoint = polyline[0],
      totalDistance = 0,
      queryPolyline = [];

    for (let i = 1; i < polyline.length; ++i) {
      endPoint = polyline[i];
      let distance = geometry.computeDistanceBetween(startPoint, endPoint),
        // How many times we should move our startPoint by 'BufferRadius'
        // meters?
        bufferStepCount = Math.trunc(distance / bufferStepLength);

      // If the distance is negligeble then skip to the
      // next point.
      if (distance == 0) {
        continue;
      }

      totalDistance += distance;

      queryPolyline.push(BufferHelpers.latLngToArray(startPoint));
      for (let k = 0; k < bufferStepCount; ++k) {
        startPoint = BufferHelpers.moveLatLngBy(startPoint, endPoint, bufferStepLength);
        queryPolyline.push(BufferHelpers.latLngToArray(startPoint));
      }

      // Prepare for the next iteration.
      // Because endPoint is the start of next iteration,
      // no need to store it in the queryPolyline.
      startPoint = endPoint;
    }

    // Don't forget to push the last endPoint to the queryPolyline,
    // for we don't accumulate leg endPoints in the it.
    queryPolyline.push(BufferHelpers.latLngToArray(endPoint));

    return {
      start: BufferHelpers.latLngToArray(polyline[0]),
      end: BufferHelpers.latLngToArray(endPoint),
      distance: totalDistance,
      queryPolyline: queryPolyline
    };
  }

  static getQuerySections(polylines, bufferStepLength) {
    return polylines.map(pl => this.getQuerySection(pl, bufferStepLength));
  }

  static wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  static queryPromise(geoFireRef, prevPoint, currentPoint, nextPoint,
    queryRadius, bufferWidth) {
    return new Promise(function (resolve, reject) {
      let queryResult = [],
        query = geoFireRef.query({
          center: currentPoint,
          radius: queryRadius
        });

      query.on('key_entered', function(key, location) {
        // Proximity check.
        // Proximity check is a must because queryRadius is wider than
        // bufferWidth.
        let prevD = Number.MAX_VALUE, nextD = Number.MAX_VALUE, d = Number.MAX_VALUE;
        if (prevPoint != null) {
          prevD = BufferHelpers.computeClosestDistance(prevPoint, currentPoint, location);
        }
        if (nextPoint != null) {
          nextD = BufferHelpers.computeClosestDistance(currentPoint, nextPoint, location);
        }
        if (prevPoint == null || nextPoint == null) {
          d = geometry.computeDistanceBetween(
            BufferHelpers.arrayToLatLng(currentPoint),
            BufferHelpers.arrayToLatLng(location));
        }

        let minD = Math.min(prevD, nextD, d),
          deltaD = minD - bufferWidth;

        if (deltaD <= BufferRadiusMin) {
          queryResult.push({
            key: key,
            location: location
          });
        }
      });

      query.on('ready', function(key, location) {
        query.cancel();
        resolve(queryResult);
      });
    });
  }

  static queryQuerySection(geoFireRef, querySection, queryRadius, bufferWidth) {
    // GeoFire only accepts query radius in kms.
    // Convert queryRadius which is in meters to kilometers.
    queryRadius /= 1000;

    // querySection layout:
    //
    //  {
    //    start: startPoint,
    //    end: endPoint,
    //    distance: distance,
    //    polyline: queryPolyline
    //  }
    let polyline = querySection.queryPolyline;
    return new Promise(function (resolve, reject) {
      let qPromises = [];

      for (let i = 0; i < polyline.length; ++i) {
        let prevPoint = i == 0 ? null : polyline[i - 1],
          currentPoint = polyline[i],
          nextPoint = polyline.length == i + 1 ? null : polyline[i + 1];

        qPromises.push(
          BufferHelpers.queryPromise(geoFireRef, prevPoint, currentPoint,
            nextPoint, queryRadius, bufferWidth));
      }

      Promise.all(qPromises).then(queryResults => {
        let resultMap = new Map();
        for (let queryResult of queryResults) {
          for (let keyLocation of queryResult) {
            if (!resultMap.has(keyLocation.key)) {
              resultMap.set(keyLocation.key, keyLocation);
            }
          }
        }

        resolve({
          querySection: querySection,
          queryResult: resultMap
        });
      });
    });
  }
}

// 'FireBuffer' performs a linear buffer analysis on a GeoFire
// Firebase node noting how many unique points indexed at GeoFire encoded
// fall within the linear buffer generated from two points.
class FireBuffer {
  /**
   * Constructs a GeoFireBuffer.
   * @param {GeoFire} geoFireRef
   */
  constructor(geoFireRef) {
    if (!(geoFireRef instanceof GeoFire)) {
      throw new Error('geoFireRef needs to be an instance of GeoFire.');
    }

    this._geoFireRef = geoFireRef;
  }

  /**
   * Performs a buffer analysis over an array of line segments, which are
   * themselves arrays of points, denoted as, arrays of
   * latitude-longitude pairs
   * (i.e. [ [ [ lat11, lng11 ], [lat12, lng12], ... ],
   * [ [ lat21, lng21 ], [lat22, lng22], ... ], ... ]), taking into account
   * a width of bufferWidth. Returns a promise.
   * @param {Array.<Array.<Array>>} polylineSections
   * @param {number} bufferWidth
   * @returns {Promise} promise
   */
  analyze(sections, bufferWidth) {
    if (typeof bufferWidth != 'number') {
      throw new Error('Invalid buffer radius.');
    }
    if (bufferWidth < BufferRadiusMin) {
      throw new Error(`Buffer width cannot be smaller then (${BufferRadiusMin}) meters.`);
    }

    let that = this,
      bufferStepLength = BufferHelpers.getBufferStepLength(bufferWidth);

    return new Promise(function (resolve, reject) {
      let querySections = BufferHelpers.getQuerySections(sections, bufferStepLength),
        queryPromises = querySections.map(
          qSec => BufferHelpers.queryQuerySection(that._geoFireRef, qSec, bufferStepLength, bufferWidth));

      Promise.all(queryPromises).then(results => resolve(results));
    });
  }
};

module.exports = FireBuffer;
