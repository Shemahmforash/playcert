from pyramid.view import view_config
import os, eventful, redis, datetime, json

api = eventful.API(os.environ['EVENTFUL_KEY'])
redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)

@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}

@view_config(route_name='events', renderer='templates/events.pt')
def events_view(request):
    today = datetime.date.today()
    #get events from redis
    events = redisClient.get('events.' + str(today))
    events = json.loads(events) if events else ''
    if not events :
        #or get the events from the eventful api
        events = api.call('/events/search', c='music', l='Lisbon', date='This week')
        redisClient.set('events.' + str(today), json.dumps(events))

    return {'events': events['events']['event']}
