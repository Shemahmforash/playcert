from pyramid.view import view_config
import os, eventful, redis, datetime, json
from pyechonest import config, artist

config.ECHO_NEST_API_KEY=os.environ['ECHONEST_KEY']
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

    events = process_events(events)

    return {'events': events}

def process_events(events):
    processed = []
    artists = []

    for event in events['events']['event']:
        event_processed = {}
        event_processed['title'] = event['title']
        event_processed['venue'] = event['venue_name']
        event_processed['artist'] = ''

        if isinstance(event['performers'], dict):
            event_processed['artist'] = event['performers']['performer']['name']
            #TODO: find artist from spotify
            #event_processed['artist_info'] = artist.Artist(event_processed['artist'])
            artist_info = artist.Artist(event_processed['artist'], bucket="id:spotify-WW")

        processed.append(event_processed)

    return processed
