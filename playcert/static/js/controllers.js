var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$http', '$routeParams', "$sce",
  function ($scope, $http, $routeParams, $sce) {

  	var location = $routeParams.location;

    $http.get('events/' + location + '.json').success(function(data) {
      $scope.location = data.location;
      $scope.events = data.events;
      $scope.playlist = $sce.trustAsResourceUrl(
            "//embed.spotify.com/?uri=spotify:trackset:Playlist:" + data.playlist
        );
    });
  }]);

playcertControllers.controller('LocationCtrl', ['$scope', '$location', function ($scope, $location) {

    //on page load, fill place
    console.log('place: ', $scope.place);

    $scope.autocompleteOptions = {
        types: ['(cities)'],
    }

    $scope.change = function() {
        if (typeof $scope.place !== 'object') {
            return;
        }

        console.log('place: ', $scope.place, $scope.place.name);

        //change uri to include the city
        $location.path('/events/' + $scope.place.name);

    };
}]);

playcertControllers.controller('HomeCtrl', ['$scope',
  function($scope) {
    console.log('home!!');
  }]);
