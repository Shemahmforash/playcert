var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$http', '$routeParams', "$sce", 'usSpinnerService',
  function ($scope, $http, $routeParams, $sce, usSpinnerService) {

  	var location = $routeParams.location;

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

playcertControllers.controller('AboutCtrl', ['$scope', '$location', 'usSpinnerService', function ($scope, $location, usSpinnerService) {
    usSpinnerService.stop('spinner-1');
    $scope.viewHide = 0;
}]);

playcertControllers.controller('HomeCtrl', ['$scope', 'geolocation', '$http', '$location', 'usSpinnerService',
  function($scope, geolocation, $http, $location, usSpinnerService) {

    $scope.viewHide = 1;
    usSpinnerService.spin('spinner-1');
    geolocation.getLocation().then(function(data){

        //obtain the coordinates from the browser
        $scope.coords = {lat:data.coords.latitude, long:data.coords.longitude};

        //try to obtain the city from the coordinates
        var uri = "http://maps.googleapis.com/maps/api/geocode/json?latlng=" + data.coords.latitude +  "," + data.coords.longitude + "&sensor=true";
        $http.get(uri).success(function(data) {
            var results = data.results;

            for (var i = 0 ; i < results.length; i++) {
                var result = results[i];

                var components = result.address_components;
                for (var k = 0; k < components.length; k++) {
                    var component = components[i];
                    console.log('component', component);

                    if (!component) {
                        continue;
                    }

                    if (component.types.indexOf('political') !== -1) {
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
    });
  }]);
