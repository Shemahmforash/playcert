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

    //TODO: on page load, fill place
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

playcertControllers.controller('HomeCtrl', ['$scope',
  function($scope) {
    console.log('home!!');
  }]);
