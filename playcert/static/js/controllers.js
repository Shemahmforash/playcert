var playcertControllers = angular.module('playcertControllers', []);

playcertControllers.controller('EventListCtrl', ['$scope', '$http', '$routeParams', "$sce",
  function ($scope, $http, $routeParams, $sce) {

  	var location = $routeParams.location;

    $http.get('events/' + location + '.json').success(function(data) {
      $scope.events = data.events;
      $scope.playlist = $sce.trustAsResourceUrl(
            "//embed.spotify.com/?uri=spotify:trackset:Playlist:" + data.playlist
        );
    });
  }]);