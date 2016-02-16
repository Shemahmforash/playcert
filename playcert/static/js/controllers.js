var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$rootScope', '$http', '$routeParams', "$sce", 'usSpinnerService',
  function ($scope, $rootScope, $http, $routeParams, $sce, usSpinnerService) {

  	var location = $routeParams.location;

    $rootScope.home = 1;
    $rootScope.about = 0;

    $scope.place = location;

    $scope.viewHide = 1;
    usSpinnerService.spin('spinner-1');
    $http.get('events/' + location + '.json').success(function(data) {
      $scope.location = data.location;
      $scope.events = data.events;

      $scope.playlist = $sce.trustAsResourceUrl(
            "//embed.spotify.com/?uri=spotify:trackset:Playlist:" + data.playlist
        );
    }).then(function successCallback(response) {
        usSpinnerService.stop('spinner-1');
        $scope.viewHide = 0;
      }, function errorCallback(response) {
        // called asynchronously if an error occurs
        // or server returns response with an error status.
        usSpinnerService.stop('spinner-1');
        $scope.viewHide = 0;
      });
  }]);

playcertControllers.controller('LocationCtrl', ['$scope', '$location', function ($scope, $location) {
    $scope.autocompleteOptions = {
        types: ['(cities)'],
    }

    $scope.change = function() {
        if (typeof $scope.place !== 'object') {
            return;
        }

        //change uri to include the city
        $location.path('/events/' + $scope.place.name);

    };
}]);

playcertControllers.controller('AboutCtrl', ['$scope', '$rootScope', '$location', 'usSpinnerService', function ($scope, $rootScope, $location, usSpinnerService) {
    $rootScope.about = 1;
    $rootScope.home = 0;
    usSpinnerService.stop('spinner-1');
    $scope.viewHide = 0;
}]);

playcertControllers.controller('HomeCtrl', ['$scope', '$rootScope', 'geolocation', '$http', '$location', 'usSpinnerService',
  function($scope, $rootScope, geolocation, $http, $location, usSpinnerService) {

    $rootScope.home = 1;
    $rootScope.about = 0;

    $scope.viewHide = 1;
    usSpinnerService.spin('spinner-1');
    geolocation.getLocation().then(function(data){

        //obtain the coordinates from the browser
        $scope.coords = {lat:data.coords.latitude, long:data.coords.longitude};

        // console.log('coords: ', $scope.coords);

        var uri = '/coordinates/city.json?latitude=' + data.coords.latitude + '&longitude=' + data.coords.longitude;
        $http.get(uri).success(function(data) {
            // console.log('city.json data', data);
            if (data.location) {
                // console.log('city.json data', data, data.location);
                // console.log('will now redirect');
                $scope.place = data.location;
                return $location.path('/events/' + data.location);
            } else {
                //try to obtain the city from the coordinates
                var uri = "http://maps.googleapis.com/maps/api/geocode/json?latlng=" + $scope.coords.lat +  "," + $scope.coords.long + "&sensor=true";
                $http.get(uri).success(function(data) {
                    var results = data.results;

                    for (var i = 0 ; i < results.length; i++) {
                        var result = results[i];

                        var components = result.address_components;
                        for (var k = 0; k < components.length; k++) {
                            var component = components[i];

                            if (!component) {
                                continue;
                            }

                            // console.log('component', component);

                            if (component.types.indexOf('political') !== -1) {
                                //also set location for coordinates on cache
                                $http.get('/coordinates/' + component.long_name + '/set.json?latitude=' + $scope.coords.lat + '&longitude=' + $scope.coords.long ).success(function(data) {
                                });
                                $scope.place = location;
                                return $location.path('/events/' + component.long_name);
                            }
                        }
                    }
                }).then(function successCallback(response) {
                    usSpinnerService.stop('spinner-1');
                    $scope.viewHide = 0;
                  }, function errorCallback(response) {
                    // called asynchronously if an error occurs
                    // or server returns response with an error status.
                    usSpinnerService.stop('spinner-1');
                    $scope.viewHide = 0;
                  });
            }
        });

        // console.log('scope place');
        if ($scope.place) {
            return;
        }


    });
  }]);
