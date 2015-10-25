var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$http', '$routeParams',
  function ($scope, $http, $routeParams) {

  	var location = $routeParams.location;

    console.log('location', location);

    $http.get('events/' + location + '/events.json').success(function(data) {
      $scope.events = data.events;
      /*  //embed.spotify.com/?uri=spotify:trackset:Playlist:{{ playlist }}*/
      $scope.playlist = data.playlist;
    });
  }]);