from pyramid.view import view_config
import os, eventful, redis, datetime, json
from pyechonest import config, artist, song

config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
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

        events = process_events(events)

        redisClient.set('events.' + str(today), json.dumps(events))

    print 'songs'
    print events['songs']

    return {'events': events['events'], 'songs': events['songs']}

def process_events(events):
    processed = []
    artists = []
    global_songs = []

    for event in events['events']['event']:
        event_processed = {}
        event_processed['title'] = event['title']
        event_processed['venue'] = event['venue_name']
        event_processed['when']  = event['start_time']
        event_processed['artist'] = ''
        event_processed['songs'] = ''

        #TODO: if no performers from the event, use echonest to get the name of the artist from the event title
        if isinstance(event['performers'], dict):
            event_processed['artist'] = event['performers']['performer']['name']

            songs = redisClient.hget('artist.songs', event_processed['artist'])

            if not songs :
                echonest_songs = song.search(artist=event_processed['artist'], buckets=['id:spotify-WW', 'tracks'], limit=True, results=1)

                #filter song data
                simplified_songs = []
                for s in echonest_songs:
                    track = s.get_tracks('spotify-WW')[0]
    
                    simple_song = { 'title': s.title, 'foreign_id': track['foreign_id'], 'artist': event_processed['artist'] }

                    simplified_songs.append( simple_song )
                    global_songs.append( simple_song )

                event_processed['songs'] = simplified_songs

                redisClient.hset('artist.songs', event_processed['artist'], simplified_songs)
            else :
                global_songs = songs

        processed.append(event_processed)

    return {'events': processed, 'songs': global_songs}
