var playcertApp = angular.module('playcertApp', [
  'ngRoute',
  'playcertControllers'
]);

playcertApp.config(['$routeProvider',
  function($routeProvider) {
    $routeProvider.
      when('/playcert/:location', {
        templateUrl: 'partials/events.html',
        controller: 'EventListCtrl'
      }).
      otherwise({
        redirectTo: '/'
      });
  }]);