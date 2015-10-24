var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$http',
  function ($scope, $http) {

  	var location = $routeParams.location;

    console.log('location', location);

    $http.get('events/' + location + '/events.json').success(function(data) {
      $scope.events = data.events;
      $scope.playlist = data.playlist;
    });
  }]);