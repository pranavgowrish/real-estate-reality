def get_wellness_score(data):
    # data is gonna be the variable holding csv file US_AQI.csv
    # ONLY EXTRACT CITIES IN CALIFORNIA - THEN SINCE THERE IS MULTIPLE DATES FOR EACH CITY, AVERAGE ALL 
    # extract values per city and based on address given, see how far city listed in dataset is and if its less than 50, use that AQI value
    # other approach: use geopy to get the distance between the address given and the city listed in the dataset

    # 0-50: good  --> 30 pts
    # 51-100: moderate --> 25 pts
    # 101-150: unhealthy for sensitive groups --> 20 pts
    # 151-200: unhealthy --> 5 pts
    # 201-300: very unhealthy --> 0 pts
    # 301-500: hazardous --> 0 pts

    # return the total points as a score out of 100 
    




